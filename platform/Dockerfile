FROM mcr.microsoft.com/dotnet/sdk:10.0 AS restore
WORKDIR /source
COPY Directory.Build.props ./
COPY src/Platform.Api/Platform.Api.csproj src/Platform.Api/
COPY tests/Platform.Api.IntegrationTests/Platform.Api.IntegrationTests.csproj tests/Platform.Api.IntegrationTests/
RUN --mount=type=secret,id=build_ca,required=false \
    if [ -s /run/secrets/build_ca ]; then \
      cp /run/secrets/build_ca /usr/local/share/ca-certificates/local-build-proxy.crt && update-ca-certificates; \
    fi && \
    dotnet restore tests/Platform.Api.IntegrationTests/Platform.Api.IntegrationTests.csproj

FROM restore AS build
COPY src/ src/
RUN dotnet publish src/Platform.Api/Platform.Api.csproj --no-restore -c Release -o /app/publish /p:UseAppHost=false

FROM restore AS test-build
COPY src/ src/
COPY tests/ tests/
RUN dotnet build tests/Platform.Api.IntegrationTests/Platform.Api.IntegrationTests.csproj --no-restore -c Release && \
    tar -C tests/Platform.Api.IntegrationTests/bin/Release/net10.0 -czf /tmp/integration-tests.tgz . && \
    rm -rf src/Platform.Api/bin src/Platform.Api/obj \
      tests/Platform.Api.IntegrationTests/bin tests/Platform.Api.IntegrationTests/obj

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS test-runner
WORKDIR /tests
COPY --from=test-build /tmp/integration-tests.tgz /tmp/integration-tests.tgz
RUN tar -xzf /tmp/integration-tests.tgz -C /tests && rm /tmp/integration-tests.tgz
CMD ["dotnet", "vstest", "/tests/Platform.Api.IntegrationTests.dll", "--logger:console;verbosity=normal"]

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
RUN apt-get update && \
    apt-get install --no-install-recommends -y libgssapi-krb5-2 && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=$APP_UID:$APP_UID --from=build /app/publish ./
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "Platform.Api.dll"]
