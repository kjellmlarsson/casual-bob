package se.bob;

import io.smallrye.common.annotation.Identifier;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import se.laz.casual.api.buffer.CasualBuffer;
import se.laz.casual.api.buffer.ServiceReturn;
import se.laz.casual.api.buffer.type.OctetBuffer;
import se.laz.casual.api.flags.AtmiFlags;
import se.laz.casual.api.flags.ErrorState;
import se.laz.casual.api.flags.Flag;
import se.laz.casual.api.flags.ServiceReturnState;
import se.laz.casual.jca.CasualConnection;
import se.laz.casual.jca.CasualConnectionFactory;

import java.nio.charset.StandardCharsets;
import java.util.List;

@ApplicationScoped
public class FactService {

    private static final String SERVICE_NAME = "catfacts/random";
    private final CasualConnectionFactory connectionFactory;

    @Inject
    public FactService(@Identifier("casual") CasualConnectionFactory connectionFactory) {
        this.connectionFactory = connectionFactory;
    }

    public FactResponse getFact() {
        try (CasualConnection connection = connectionFactory.getConnection()) {
            CasualBuffer requestBuffer = OctetBuffer.of(new byte[0]);
            ServiceReturn<CasualBuffer> reply = connection.tpcall(SERVICE_NAME, requestBuffer, Flag.of(AtmiFlags.NOFLAG));
            if (reply == null) {
                throw new CasualGatewayException("No reply received from Casual service");
            }
            if (reply.getErrorState() == ErrorState.TPETIME) {
                throw new CasualTimeoutException("Casual service timed out");
            }
            if (reply.getErrorState() != ErrorState.OK) {
                throw new CasualGatewayException("Casual service failed with error state: " + reply.getErrorState());
            }
            if (reply.getServiceReturnState() == ServiceReturnState.TPFAIL) {
                throw new CasualGatewayException("Casual service returned TPFAIL");
            }
            CasualBuffer replyBuffer = reply.getReplyBuffer();
            if (replyBuffer == null) {
                throw new CasualGatewayException("Empty reply received from Casual");
            }
            List<byte[]> bytesList = replyBuffer.getBytes();
            if (bytesList == null || bytesList.isEmpty() || bytesList.get(0).length == 0) {
                throw new CasualGatewayException("Empty reply received from Casual");
            }
            String fact = new String(bytesList.get(0), StandardCharsets.UTF_8);
            return new FactResponse(fact);
        } catch (CasualTimeoutException | CasualGatewayException e) {
            throw e;
        } catch (Exception e) {
            throw new CasualGatewayException("Unable to connect to Casual: " + e.getMessage(), e);
        }
    }
}
