#include "casual/xatmi.h"
#include "casual/xatmi/extended.h"

#include <curl/curl.h>

#include <charconv>
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
