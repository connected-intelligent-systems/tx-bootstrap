# syntax=docker/dockerfile:1.7
FROM tractusx/edc-dataplane-hashicorp-vault:0.13.0@sha256:de22ff97df715244de7c04784ee3fe6f08d369064186da675dcaffda63b5062c AS upstream
FROM eclipse-temurin:17-jdk AS java-toolchain

# Rebuild the pinned source with patched serializer dependencies.
FROM eclipse-temurin:25-jdk AS compiler
COPY --from=java-toolchain /opt/java/openjdk /opt/java/jdk17
WORKDIR /runtime
ADD --checksum=sha256:ad17463b033702360556d931380520626c27a99231bbebeffe62cb0e874f14d3 https://codeload.github.com/eclipse-tractusx/tractusx-edc/tar.gz/964d33d7ed942369f624aacbc45037a1f79fc7be /tmp/runtime-source.tar.gz
RUN tar -xzf /tmp/runtime-source.tar.gz --strip-components=1 -C /runtime \
    && rm /tmp/runtime-source.tar.gz \
    && printf '\norg.gradle.java.installations.paths=/opt/java/jdk17\n' >> gradle.properties
COPY dependency-security.init.gradle /build/dependency-security.init.gradle
RUN --mount=type=cache,target=/root/.gradle,sharing=locked \
    ./gradlew --no-daemon --max-workers=2 -Dorg.gradle.jvmargs=-Xmx1536m \
    --init-script /build/dependency-security.init.gradle \
    :edc-dataplane:edc-dataplane-hashicorp-vault:shadowJar -x test

# Compile and check the extension against the rebuilt runtime.
WORKDIR /build
RUN cp /runtime/edc-dataplane/edc-dataplane-hashicorp-vault/build/libs/edc-dataplane-hashicorp-vault.jar edc-runtime.jar
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
USER root
RUN apk upgrade --no-cache
USER docker
COPY --from=compiler --chown=docker:docker /build/edc-runtime.jar /app/edc-runtime.jar
COPY --from=compiler --chown=docker:docker /build/s3-http-pull-extension.jar /app/s3-http-pull-extension.jar
# Load the rebuilt runtime and the separate extension through the standard SPI.
ENTRYPOINT ["java", "-javaagent:/app/opentelemetry-javaagent.jar", "-Dotel.javaagent.configuration-file=/app/opentelemetry.properties", "-Dedc.fs.config=/app/configuration.properties", "-Djava.security.egd=file:/dev/urandom", "-cp", "/app/edc-runtime.jar:/app/s3-http-pull-extension.jar", "org.eclipse.edc.boot.system.runtime.BaseRuntime"]
