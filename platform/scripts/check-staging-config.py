#!/usr/bin/env python3
"""Validate an already resolved Docker Compose JSON config without printing secrets.

Usage: docker compose ... config --format json | python3 check-staging-config.py [--example]
--example permits fake secrets and an invalid example domain for CI syntax checks.
"""
import base64
import json
import re
import sys


def require(condition, message):
    if not condition:
        raise SystemExit("STAGING CHECK FAILED: " + message)


def networks(service):
    value = service.get("networks") or {}
    return set(value if isinstance(value, list) else value.keys())


def published_ports(service):
    return service.get("ports") or []


def service_environment(service):
    value = service.get("environment") or {}
    if isinstance(value, list):
        return dict(item.split("=", 1) for item in value if "=" in item)
    return value


def main():
    example = sys.argv[1:] == ["--example"]
    require(sys.argv[1:] in ([], ["--example"]), "unexpected arguments")
    try:
        config = json.load(sys.stdin)
    except (ValueError, UnicodeDecodeError):
        raise SystemExit("STAGING CHECK FAILED: invalid Compose JSON") from None

    services = config.get("services", {})
    for key in ("db", "migrate", "api", "caddy"):
        require(key in services, "missing service: " + key)

    db = services["db"]
    api = services["api"]
    proxy = services["caddy"]
    migrate = services["migrate"]
    require(not published_ports(db), "database must not publish ports")
    require(networks(db) == {"database"}, "database must use only internal database network")
    require(networks(migrate) == {"database"}, "migrator must use only internal database network")
    require(networks(api) == {"database", "ingress"}, "API must use database and ingress networks")
    require(networks(proxy) == {"ingress"}, "HTTPS proxy must not join database network")
    require(bool(config.get("networks", {}).get("database", {}).get("internal")),
            "database Docker network must be internal")

    for name in ("teacher-bootstrap", "student-import", "homework-import", "pgadmin"):
        if name in services:
            require(networks(services[name]) == {"database"},
                    name + " must not join public ingress")

    for port in published_ports(api):
        host = port.get("host_ip")
        require(host in ("127.0.0.1", "::1"), "API 8080 must only bind localhost")
    web_ports = {(str(p.get("target")), p.get("protocol", "tcp"))
                 for p in published_ports(proxy)}
    require({("80", "tcp"), ("443", "tcp")}.issubset(web_ports),
            "proxy must publish HTTP/HTTPS for managed TLS")
    require(all(str(p.get("target")) in ("80", "443") for p in published_ports(proxy)),
            "proxy publishes an unexpected port")
    for service in services.values():
        for port in published_ports(service):
            require(str(port.get("target")) != "5432", "Postgres port must not be published")

    db_env = service_environment(db)
    api_env = service_environment(api)
    proxy_env = service_environment(proxy)

    require(api_env.get("ASPNETCORE_URLS") == "http://+:8080",
            "API container must listen on internal 8080")
    require("Host=db;Port=5432;" in api_env.get("Database__ConnectionString", ""),
            "API database must be the internal db service")
    origin = api_env.get("Cors__AllowedOrigins__0", "")
    cors_host = origin.removeprefix("https://")
    require(origin.startswith("https://") and re.fullmatch(
        r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}",
        cors_host, re.IGNORECASE),
        "staging CORS must be an explicit HTTPS DNS origin without path/wildcard")

    domain = proxy_env.get("STAGING_DOMAIN", "")
    domain_valid = re.fullmatch(
        r"(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}",
        domain, re.IGNORECASE
    ) is not None
    require(domain_valid, "STAGING_DOMAIN must be a single fully qualified DNS name")

    if not example:
        require(not domain.lower().endswith((".invalid", ".example", ".test", ".local")),
                "replace the example domain with a DNS name you control")
        admin_password = service_environment(services.get("pgadmin", {})).get("PGADMIN_DEFAULT_PASSWORD", "")
        require(len(admin_password) >= 16 and not re.search(
            r"replace|example|changeme", admin_password, re.I),
            "replace placeholder pgAdmin password even when tools profile is disabled")
        password = db_env.get("POSTGRES_PASSWORD", "")
        require(len(password) >= 16 and not re.search(r"replace|example|changeme", password, re.I),
                "replace placeholder database password with 16+ random characters")
        jwt = api_env.get("Jwt__SigningKey", "")
        pepper = api_env.get("StudentCodes__Pepper", "")
        decoded = []
        for name, raw in (("JWT signing key", jwt), ("student code pepper", pepper)):
            try:
                key = base64.b64decode(raw, validate=True)
            except (ValueError, TypeError):
                key = b""
            require(len(key) >= 32, name + " must be a valid Base64 secret of 32+ bytes")
            decoded.append(key)
        require(decoded[0] != decoded[1], "JWT and student pepper secrets must differ")
        require("Password=" + password in api_env.get("Database__ConnectionString", ""),
                "database credentials do not match")

    print("PASS: staging Compose networks, private PostgreSQL, loopback API, HTTPS ingress"
          + (" (example configuration only)" if example else " and private secrets"))


if __name__ == "__main__":
    main()
