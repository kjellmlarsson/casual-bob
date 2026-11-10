package se.bob;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import se.laz.casual.api.buffer.CasualBuffer;
import se.laz.casual.api.buffer.ServiceReturn;
import se.laz.casual.api.buffer.type.OctetBuffer;
import se.laz.casual.api.flags.ErrorState;
import se.laz.casual.api.flags.ServiceReturnState;
import se.laz.casual.jca.CasualConnection;
import se.laz.casual.jca.CasualConnectionFactory;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

public class FactServiceTest {

    private CasualConnectionFactory connectionFactory;
    private CasualConnection connection;
    private FactService factService;

    @BeforeEach
    void setUp() throws Exception {
        connectionFactory = mock(CasualConnectionFactory.class);
        connection = mock(CasualConnection.class);
        when(connectionFactory.getConnection()).thenReturn(connection);
        factService = new FactService(connectionFactory);
    }

    @Test
    void test_getFact_success() {
        byte[] payload = "CATS ARE INDEPENDENT".getBytes(StandardCharsets.UTF_8);
        CasualBuffer replyBuffer = OctetBuffer.of(payload);
        ServiceReturn<CasualBuffer> serviceReturn = new ServiceReturn<>(replyBuffer, ServiceReturnState.TPSUCCESS, ErrorState.OK, 0);

        when(connection.tpcall(eq("catfacts/random"), any(), any())).thenReturn(serviceReturn);

        FactResponse response = factService.getFact();
        assertEquals("CATS ARE INDEPENDENT", response.fact());
        verify(connection).close();
    }

    @Test
    void test_getFact_timeout_throwsCasualTimeoutException() {
        ServiceReturn<CasualBuffer> serviceReturn = new ServiceReturn<>(null, ServiceReturnState.TPFAIL, ErrorState.TPETIME, 0);
        when(connection.tpcall(eq("catfacts/random"), any(), any())).thenReturn(serviceReturn);

        assertThrows(CasualTimeoutException.class, () -> factService.getFact());
        verify(connection).close();
    }

    @Test
    void test_getFact_errorState_throwsCasualGatewayException() {
        ServiceReturn<CasualBuffer> serviceReturn = new ServiceReturn<>(null, ServiceReturnState.TPFAIL, ErrorState.TPESVCERR, 0);
        when(connection.tpcall(eq("catfacts/random"), any(), any())).thenReturn(serviceReturn);

        assertThrows(CasualGatewayException.class, () -> factService.getFact());
        verify(connection).close();
    }

    @Test
    void test_getFact_connectionFailure_throwsCasualGatewayException() throws Exception {
        when(connectionFactory.getConnection()).thenThrow(new RuntimeException("Connection refused"));

        assertThrows(CasualGatewayException.class, () -> factService.getFact());
    }

    @Test
    void test_getFact_emptyReply_throwsCasualGatewayException() {
        CasualBuffer emptyBuffer = OctetBuffer.of(new byte[0]);
        ServiceReturn<CasualBuffer> serviceReturn = new ServiceReturn<>(emptyBuffer, ServiceReturnState.TPSUCCESS, ErrorState.OK, 0);
        when(connection.tpcall(eq("catfacts/random"), any(), any())).thenReturn(serviceReturn);

        assertThrows(CasualGatewayException.class, () -> factService.getFact());
        verify(connection).close();
    }
}
