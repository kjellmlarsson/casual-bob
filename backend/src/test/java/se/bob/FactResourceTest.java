package se.bob;

import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.is;

@QuarkusTest
public class FactResourceTest {

    @InjectMock
    FactService factService;

    @Test
    void test_getFact_success__returns_200_and_json() {
        Mockito.when(factService.getFact()).thenReturn(new FactResponse("CATS SLEEP A LOT"));

        given()
                .when().get("/api/fact")
                .then()
                .statusCode(200)
                .contentType(ContentType.JSON)
                .body("fact", is("CATS SLEEP A LOT"));
    }

    @Test
    void test_getFact_serviceError__returns_502() {
        Mockito.when(factService.getFact()).thenThrow(new CasualGatewayException("Casual service failed"));

        given()
                .when().get("/api/fact")
                .then()
                .statusCode(502)
                .contentType(ContentType.JSON)
                .body("error", is("Casual service failed"));
    }

    @Test
    void test_getFact_timeout__returns_504() {
        Mockito.when(factService.getFact()).thenThrow(new CasualTimeoutException("Casual service timed out"));

        given()
                .when().get("/api/fact")
                .then()
                .statusCode(504)
                .contentType(ContentType.JSON)
                .body("error", is("Casual service timed out"));
    }

    @Test
    void test_health_live__returns_200() {
        given()
                .when().get("/q/health/live")
                .then()
                .statusCode(200)
                .body("status", is("UP"));
    }

    @Test
    void test_health_ready__returns_200() {
        given()
                .when().get("/q/health/ready")
                .then()
                .statusCode(200)
                .body("status", is("UP"));
    }
}
