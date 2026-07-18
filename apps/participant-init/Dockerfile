FROM alpine:3.20

RUN apk add --no-cache ca-certificates coreutils curl jq \
    && addgroup -S participant \
    && adduser -S -D -H -G participant participant

COPY --chown=participant:participant participant-init.sh /usr/local/bin/participant-init
RUN chmod 0555 /usr/local/bin/participant-init

USER participant
ENTRYPOINT ["/usr/local/bin/participant-init"]
