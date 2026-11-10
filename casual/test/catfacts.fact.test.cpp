#include "catfacts.fact.h"

#include <gtest/gtest.h>

namespace catfacts::fact
{
   TEST( catfacts_fact, parse__valid_json__expect_fact_text)
   {
      auto result = parse( R"({"fact":"Cats sleep a lot","length":17})");

      ASSERT_TRUE( result.has_value());
      EXPECT_EQ( *result, "Cats sleep a lot");
   }

   TEST( catfacts_fact, parse__not_json__expect_nullopt)
   {
      EXPECT_NO_THROW( EXPECT_FALSE( parse( "<html>502 Bad Gateway</html>").has_value()));
   }

   TEST( catfacts_fact, parse__json_without_fact__expect_nullopt)
   {
      EXPECT_FALSE( parse( R"({"length":17})").has_value());
   }

   TEST( catfacts_fact, parse__empty_fact__expect_nullopt)
   {
      EXPECT_FALSE( parse( R"({"fact":""})").has_value());
   }
}
