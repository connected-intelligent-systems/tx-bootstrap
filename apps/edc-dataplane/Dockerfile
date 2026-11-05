# Compile and test against the exact runtime packaged in the base image.
FROM tractusx/edc-dataplane-hashicorp-vault:0.12.1 AS upstream
FROM eclipse-temurin:25-jdk AS compiler
WORKDIR /build
COPY --from=upstream /app/edc-runtime.jar ./edc-runtime.jar
COPY src/ ./src/
COPY resources/ ./resources/
RUN mkdir -p classes \
    && javac --release 17 -cp edc-runtime.jar -d classes src/org/txbootstrap/edc/dataplane/S3HttpPullExtension.java \
    && cp -R resources/. classes/ \
    && jar cf s3-http-pull-extension.jar -C classes .
COPY tests/ ./tests/
RUN mkdir -p test-classes \
    && javac --release 17 -cp edc-runtime.jar:s3-http-pull-extension.jar -d test-classes tests/org/txbootstrap/edc/dataplane/S3HttpPullExtensionTest.java \
    && java -cp edc-runtime.jar:s3-http-pull-extension.jar:test-classes org.txbootstrap.edc.dataplane.S3HttpPullExtensionTest

FROM upstream
COPY --from=compiler --chown=docker:docker /build/s3-http-pull-extension.jar /app/s3-http-pull-extension.jar
# Keep the upstream runtime intact and add the extension to its classpath.
ENTRYPOINT ["java", "-javaagent:/app/opentelemetry-javaagent.jar", "-Dotel.javaagent.configuration-file=/app/opentelemetry.properties", "-Dedc.fs.config=/app/configuration.properties", "-Djava.security.egd=file:/dev/urandom", "-cp", "/app/edc-runtime.jar:/app/s3-http-pull-extension.jar", "org.eclipse.edc.boot.system.runtime.BaseRuntime"]
