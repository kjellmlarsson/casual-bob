package se.bob;

import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

@Provider
public class CasualExceptionMapper implements ExceptionMapper<Throwable> {

    @Override
    public Response toResponse(Throwable exception) {
        if (exception instanceof CasualTimeoutException) {
            return Response.status(Response.Status.GATEWAY_TIMEOUT)
                    .type(MediaType.APPLICATION_JSON)
                    .entity(new ErrorResponse(exception.getMessage()))
                    .build();
        }
        if (exception instanceof CasualGatewayException) {
            return Response.status(502) // 502 Bad Gateway
                    .type(MediaType.APPLICATION_JSON)
                    .entity(new ErrorResponse(exception.getMessage()))
                    .build();
        }
        return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .type(MediaType.APPLICATION_JSON)
                .entity(new ErrorResponse(exception.getMessage() != null ? exception.getMessage() : "Internal server error"))
                .build();
    }
}
