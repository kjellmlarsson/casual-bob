#include "catfacts.fact.h"

#include "casual/xatmi.h"
#include "casual/xatmi/extended.h"

#include <curl/curl.h>

#include <algorithm>
#include <charconv>
#include <cstddef>
#include <cstring>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <system_error>
#include <utility>

namespace catfacts
{
   namespace
   {
      namespace default_value
      {
         constexpr std::string_view url = "https://catfact.ninja/fact";
         constexpr long timeout_ms = 5000;
      } // default_value

      //! Set once by tpsvrinit, read by the service.
      struct Settings
      {
         std::string url{ default_value::url};
         long timeout_ms = default_value::timeout_ms;
         std::string forward; //! empty: reply directly
      };

      Settings settings;

      //! A whole-string, positive decimal number. Anything else (empty, trailing characters, overflow,
      //! zero, negative) gives nullopt.
      std::optional< long> positive( std::string_view text)
      {
         long value{};
         auto [ end, error] = std::from_chars( text.data(), text.data() + text.size(), value);

         if( error != std::errc{} || end != text.data() + text.size() || value <= 0)
            return std::nullopt;

         return value;
      }

      //! Parses the server arguments (argv[0] is the program name and is skipped).
      //! Returns nullopt, after logging the reason, if an argument is unknown or has a missing or invalid value.
      std::optional< Settings> parse( int argc, char** argv)
      {
         Settings result;

         for( int index = 1; index < argc; ++index)
         {
            std::string_view argument = argv[ index];

            auto value = [ & ]() -> const char*
            {
               return index + 1 < argc ? argv[ ++index] : nullptr;
            };

            if( argument == "--url")
            {
               auto text = value();
               if( ! text || ! *text)
               {
                  casual_log( c_log_error, "catfacts: --url needs a non-empty value");
                  return std::nullopt;
               }
               result.url = text;
            }
            else if( argument == "--timeout-ms")
            {
               auto text = value();
               auto number = text ? positive( text) : std::nullopt;
               if( ! number)
               {
                  casual_log( c_log_error, "catfacts: --timeout-ms needs a positive integer, got '%s'", text ? text : "");
                  return std::nullopt;
               }
               result.timeout_ms = *number;
            }
            else if( argument == "--forward")
            {
               auto text = value();
               if( ! text)
               {
                  casual_log( c_log_error, "catfacts: --forward needs a value");
                  return std::nullopt;
               }
               result.forward = text;
            }
            else
            {
               casual_log( c_log_error, "catfacts: unknown argument '%s'", argv[ index]);
               return std::nullopt;
            }
         }

         return result;
      }
   } // <unnamed>

   namespace fetch_detail
   {
      //! The response body is capped at 1 MiB.
      constexpr std::size_t max_body = 1024 * 1024;

      //! Connect timeout is at most 2000 ms, and never more than the total timeout.
      constexpr long max_connect_timeout_ms = 2000;

      //! Called by curl, which is C: no exception may pass through. Returning anything but the
      //! number of bytes handled makes curl abort the transfer (CURLE_WRITE_ERROR). This also
      //! enforces the cap when the server does not announce a size.
      std::size_t write_body( char* data, std::size_t size, std::size_t count, void* user) noexcept
      {
         try
         {
            auto& body = *static_cast< std::string*>( user);

            if( size != 0 && count > max_body / size)
               return 0;

            const auto total = size * count;
            if( total > max_body - body.size())
               return 0;

            body.append( data, total);
            return total;
         }
         catch( ...)
         {
            return 0;
         }
      }

      struct Easy_deleter { void operator () ( CURL* easy) const noexcept { curl_easy_cleanup( easy);} };
      struct Slist_deleter { void operator () ( curl_slist* list) const noexcept { curl_slist_free_all( list);} };
   } // fetch_detail

   //! Fetches one fact from settings.url: GET with 'Accept: application/json', no redirects.
   //! Returns the fact text, or nullopt after logging the reason. Succeeds only if curl succeeded,
   //! the HTTP status is 200 and fact::parse gives a value. Does not throw.
   //! The curl handle and header list are owned by smart pointers, so they are released on every path.
   std::optional< std::string> fetch( const Settings& settings) noexcept
   {
      try
      {
         std::unique_ptr< CURL, fetch_detail::Easy_deleter> easy{ curl_easy_init()};
         if( ! easy)
         {
            casual_log( c_log_error, "catfacts: curl_easy_init failed");
            return std::nullopt;
         }

         std::unique_ptr< curl_slist, fetch_detail::Slist_deleter> headers{
            curl_slist_append( nullptr, "Accept: application/json")};
         if( ! headers)
         {
            casual_log( c_log_error, "catfacts: failed to create the request headers");
            return std::nullopt;
         }

         std::string body;
         CURLcode code = CURLE_OK;

         // stops at the first failing option
         auto set = [ & ]( CURLoption option, auto value)
         {
            if( code == CURLE_OK)
               code = curl_easy_setopt( easy.get(), option, value);
         };

         set( CURLOPT_URL, settings.url.c_str());
         set( CURLOPT_HTTPHEADER, headers.get());
         set( CURLOPT_TIMEOUT_MS, settings.timeout_ms);
         set( CURLOPT_CONNECTTIMEOUT_MS, std::min( fetch_detail::max_connect_timeout_ms, settings.timeout_ms));
         set( CURLOPT_FOLLOWLOCATION, 0L);
         set( CURLOPT_NOSIGNAL, 1L);
         set( CURLOPT_WRITEFUNCTION, &fetch_detail::write_body);
         set( CURLOPT_WRITEDATA, &body);

         if( code != CURLE_OK)
         {
            casual_log( c_log_error, "catfacts: failed to set up the request: %s", curl_easy_strerror( code));
            return std::nullopt;
         }

         code = curl_easy_perform( easy.get());
         if( code != CURLE_OK)
         {
            casual_log( c_log_error, "catfacts: request to '%s' failed: %s", settings.url.c_str(), curl_easy_strerror( code));
            return std::nullopt;
         }

         long status = 0;
         curl_easy_getinfo( easy.get(), CURLINFO_RESPONSE_CODE, &status);
         if( status != 200)
         {
            casual_log( c_log_error, "catfacts: request to '%s' gave HTTP status %ld", settings.url.c_str(), status);
            return std::nullopt;
         }

         auto result = fact::parse( body);
         if( ! result)
            casual_log( c_log_error, "catfacts: response from '%s' has no fact", settings.url.c_str());

         return result;
      }
      catch( ...)
      {
         casual_log( c_log_error, "catfacts: fetch failed with an exception");
         return std::nullopt;
      }
   }
} // catfacts

extern "C" int tpsvrinit( int argc, char** argv)
{
   try
   {
      auto parsed = catfacts::parse( argc, argv);
      if( ! parsed)
         return -1;

      if( curl_global_init( CURL_GLOBAL_DEFAULT) != CURLE_OK)
      {
         casual_log( c_log_error, "catfacts: curl_global_init failed");
         return -1;
      }

      catfacts::settings = std::move( *parsed);
   }
   catch( ...)
   {
      casual_log( c_log_error, "catfacts: tpsvrinit failed with an exception");
      return -1;
   }

   return 0;
}

extern "C" void tpsvrdone()
{
   curl_global_cleanup();
}

//! The service catfacts/random. Ignores the request buffer.
//!
//! tpreturn and casual_service_forward end the function with a longjmp, so they are the last
//! statements, outside any try block. Everything with a destructor is destroyed in the inner scope first.
extern "C" void catfacts_random( TPSVCINFO*)
{
   char* buffer = nullptr;
   long size = 0;

   {
      // fetch does not throw. A parsed fact is never empty.
      if( auto fact = catfacts::fetch( catfacts::settings))
      {
         buffer = tpalloc( X_OCTET, nullptr, static_cast< long>( fact->size()));
         if( buffer)
         {
            std::memcpy( buffer, fact->data(), fact->size());
            size = static_cast< long>( fact->size());
         }
         else
            casual_log( c_log_error, "catfacts: tpalloc failed for %zu bytes", fact->size());
      }
   }

   // settings.forward is a global string, so it is not destroyed by the longjmp.
   if( ! buffer)
      tpreturn( TPFAIL, 0, nullptr, 0, 0);
   else if( catfacts::settings.forward.empty())
      tpreturn( TPSUCCESS, 0, buffer, size, 0);
   else
      casual_service_forward( catfacts::settings.forward.c_str(), buffer, size);
}
