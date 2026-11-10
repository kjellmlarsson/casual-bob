package se.bob;

public class CasualGatewayException extends RuntimeException {

    public CasualGatewayException(String message) {
        super(message);
    }

    public CasualGatewayException(String message, Throwable cause) {
        super(message, cause);
    }
}
