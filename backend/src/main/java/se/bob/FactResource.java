package se.bob;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/api")
public class FactResource {

    private final FactService factService;

    @Inject
    public FactResource(FactService factService) {
        this.factService = factService;
    }

    @GET
    @Path("/fact")
    @Produces(MediaType.APPLICATION_JSON)
    public FactResponse getFact() {
        return factService.getFact();
    }
}
