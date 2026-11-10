#pragma once

#include <nlohmann/json.hpp>

#include <optional>
#include <string>

namespace catfacts::fact
{
   //! Extracts the 'fact' text from the body of a catfact.ninja response.
   //! Returns nullopt if the body is not JSON, or has no non-empty string 'fact'. Never throws.
   inline std::optional< std::string> parse( const std::string& body) noexcept
   {
      try
      {
         // allow_exceptions == false: invalid JSON gives a 'discarded' value instead of a throw
         auto json = nlohmann::json::parse( body, nullptr, false);

         if( ! json.is_object())
            return std::nullopt;

         auto found = json.find( "fact");
         if( found == json.end() || ! found->is_string())
            return std::nullopt;

         auto text = found->get< std::string>();
         if( text.empty())
            return std::nullopt;

         return text;
      }
      catch( ...)
      {
         return std::nullopt;
      }
   }
}
