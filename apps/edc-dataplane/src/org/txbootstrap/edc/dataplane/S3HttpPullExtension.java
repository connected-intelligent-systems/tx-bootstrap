package org.txbootstrap.edc.dataplane;

import org.eclipse.edc.connector.dataplane.spi.edr.EndpointDataReferenceService;
import org.eclipse.edc.connector.dataplane.spi.edr.EndpointDataReferenceServiceRegistry;
import org.eclipse.edc.connector.dataplane.spi.iam.DataPlaneAuthorizationService;
import org.eclipse.edc.runtime.metamodel.annotation.Extension;
import org.eclipse.edc.runtime.metamodel.annotation.Inject;
import org.eclipse.edc.spi.system.ServiceExtension;
import org.eclipse.edc.spi.system.ServiceExtensionContext;

/** Enables S3 sources to use the runtime's existing authenticated HTTP-pull endpoint. */
@Extension("S3 source HTTP-pull EDR registration")
public class S3HttpPullExtension implements ServiceExtension {
    @Inject
    private EndpointDataReferenceServiceRegistry registry;

    @Inject
    private DataPlaneAuthorizationService authorizationService;

    @Override
    public void initialize(ServiceExtensionContext context) {
        if (!(authorizationService instanceof EndpointDataReferenceService edrService)) {
            throw new IllegalStateException("The data-plane authorization service must provide EDRs");
        }
        registry.register("AmazonS3", edrService);
        context.getMonitor().info("S3 HTTP-pull registered with the existing authorization service");
    }
}
