package org.txbootstrap.edc.dataplane;

import java.lang.reflect.Proxy;
import java.util.Map;
import java.util.ServiceLoader;

import org.eclipse.edc.connector.dataplane.framework.edr.EndpointDataReferenceServiceRegistryImpl;
import org.eclipse.edc.connector.dataplane.spi.DataFlow;
import org.eclipse.edc.connector.dataplane.spi.edr.EndpointDataReferenceService;
import org.eclipse.edc.connector.dataplane.spi.iam.DataPlaneAuthorizationService;
import org.eclipse.edc.spi.monitor.Monitor;
import org.eclipse.edc.spi.result.Result;
import org.eclipse.edc.spi.result.ServiceResult;
import org.eclipse.edc.spi.system.ServiceExtension;
import org.eclipse.edc.spi.system.ServiceExtensionContext;
import org.eclipse.edc.spi.types.domain.DataAddress;
import org.eclipse.edc.spi.types.domain.transfer.FlowType;
import org.eclipse.edc.spi.types.domain.transfer.TransferType;

/** Executed during the image build against the packaged runtime and extension JAR. */
public class S3HttpPullExtensionTest {
    public static void main(String[] args) throws Exception {
        var extension = ServiceLoader.load(ServiceExtension.class).stream()
                .filter(provider -> provider.type() == S3HttpPullExtension.class)
                .findFirst().orElseThrow(() -> new AssertionError("Extension SPI entry is missing")).get();
        var registry = new EndpointDataReferenceServiceRegistryImpl();
        var authorization = new AuthorizationService();
        registry.register("HttpData", authorization);
        var httpFlow = flow("HttpData");
        var s3Flow = flow("AmazonS3");
        require(registry.create(s3Flow, s3Flow.getSource()).failed(), "Stock lookup must expose the missing S3 registration");

        inject(extension, "registry", registry);
        inject(extension, "authorizationService", authorization);
        extension.initialize(context());

        require(registry.create(s3Flow, s3Flow.getSource()).getContent() == authorization.address,
                "S3 issuance must return the existing service's EDR unchanged");
        require(authorization.issuedFlow == s3Flow, "The negotiated flow must reach the existing service unchanged");
        require(registry.create(httpFlow, httpFlow.getSource()).getContent() == authorization.address,
                "Existing HTTP-pull issuance must remain available");

        authorization.deny = true;
        require(registry.create(s3Flow, s3Flow.getSource()).failed(), "S3 issuance failures must propagate");
        require(registry.create(httpFlow, httpFlow.getSource()).failed(), "HTTP issuance failures must propagate");
        authorization.deny = false;
        require(registry.revoke(s3Flow, "test termination").succeeded(), "HTTP-pull revocation must remain available");
        require(s3Flow.getId().equals(authorization.revokedFlowId), "Revocation must reach the existing service");

        var incompatible = new S3HttpPullExtension();
        var emptyRegistry = new EndpointDataReferenceServiceRegistryImpl();
        inject(incompatible, "registry", emptyRegistry);
        DataPlaneAuthorizationService withoutEdr = (token, properties) -> Result.failure("Unsupported token");
        inject(incompatible, "authorizationService", withoutEdr);
        try {
            incompatible.initialize(context());
            throw new AssertionError("A runtime without EDR support must fail initialization");
        } catch (IllegalStateException expected) {
            require(emptyRegistry.supportedDestinationTypes().isEmpty(), "Incompatible runtimes must not register a fallback");
        }
        System.out.println("PASS: SPI discovery, S3/HTTP issuance, failure propagation, revocation and incompatible-runtime checks");
    }

    private static DataFlow flow(String sourceType) {
        return DataFlow.Builder.newInstance()
                .id("test-" + sourceType)
                .source(DataAddress.Builder.newInstance().type(sourceType).build())
                .transferType(new TransferType("HttpData", FlowType.PULL))
                .build();
    }

    private static void inject(Object extension, String fieldName, Object value) throws Exception {
        var field = S3HttpPullExtension.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(extension, value);
    }

    private static ServiceExtensionContext context() {
        return (ServiceExtensionContext) Proxy.newProxyInstance(
                S3HttpPullExtensionTest.class.getClassLoader(), new Class<?>[]{ServiceExtensionContext.class},
                (proxy, method, args) -> {
                    if (method.getName().equals("getMonitor")) {
                        return new Monitor() {};
                    }
                    throw new UnsupportedOperationException(method.getName());
                });
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static class AuthorizationService implements DataPlaneAuthorizationService, EndpointDataReferenceService {
        private final DataAddress address = DataAddress.Builder.newInstance().type("HttpData")
                .property("endpoint", "https://participant.example/api/public/")
                .property("authorization", "test-negotiated-token").build();
        private DataFlow issuedFlow;
        private String revokedFlowId;
        private boolean deny;

        @Override
        public Result<DataAddress> authorize(String token, Map<String, Object> properties) {
            return Result.failure("Token validation is owned by the runtime");
        }

        @Override
        public Result<DataAddress> createEndpointDataReference(DataFlow flow) {
            issuedFlow = flow;
            return deny ? Result.failure("Issuance denied") : Result.success(address);
        }

        @Override
        public ServiceResult<Void> revokeEndpointDataReference(String flowId, String reason) {
            revokedFlowId = flowId;
            return ServiceResult.success();
        }
    }
}
