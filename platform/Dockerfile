FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api-restore
WORKDIR /source
COPY Directory.Build.props ./
COPY src/Platform.Api/Platform.Api.csproj src/Platform.Api/
RUN --mount=type=secret,id=build_ca,required=false \
    if [ -s /run/secrets/build_ca ]; then \
      cp /run/secrets/build_ca /usr/local/share/ca-certificates/local-build-proxy.crt && update-ca-certificates; \
    fi && \
    dotnet restore src/Platform.Api/Platform.Api.csproj

FROM api-restore AS restore
COPY src/Platform.StudentImport/Platform.StudentImport.csproj src/Platform.StudentImport/
COPY src/Platform.HomeworkImport/Platform.HomeworkImport.csproj src/Platform.HomeworkImport/
COPY tests/Platform.Api.IntegrationTests/Platform.Api.IntegrationTests.csproj tests/Platform.Api.IntegrationTests/
COPY tests/Platform.StudentImport.IntegrationTests/Platform.StudentImport.IntegrationTests.csproj tests/Platform.StudentImport.IntegrationTests/
RUN --mount=type=secret,id=build_ca,required=false \
    if [ -s /run/secrets/build_ca ]; then \
      cp /run/secrets/build_ca /usr/local/share/ca-certificates/local-build-proxy.crt && update-ca-certificates; \
    fi && \
    dotnet restore tests/Platform.Api.IntegrationTests/Platform.Api.IntegrationTests.csproj && \
    dotnet restore tests/Platform.StudentImport.IntegrationTests/Platform.StudentImport.IntegrationTests.csproj

FROM api-restore AS build
COPY src/Platform.Api/ src/Platform.Api/
RUN dotnet publish src/Platform.Api/Platform.Api.csproj --no-restore -c Release -o /app/publish /p:UseAppHost=false

FROM restore AS importer-build
COPY src/ src/
RUN dotnet publish src/Platform.StudentImport/Platform.StudentImport.csproj --no-restore -c Release -o /app/student-importer /p:UseAppHost=false && \
    dotnet publish src/Platform.HomeworkImport/Platform.HomeworkImport.csproj --no-restore -c Release -o /app/homework-importer /p:UseAppHost=false

FROM restore AS test-build
COPY src/ src/
COPY tests/ tests/
RUN dotnet build tests/Platform.Api.IntegrationTests/Platform.Api.IntegrationTests.csproj --no-restore -c Release && \
    dotnet build tests/Platform.StudentImport.IntegrationTests/Platform.StudentImport.IntegrationTests.csproj --no-restore -c Release && \
    tar -C tests/Platform.Api.IntegrationTests/bin/Release/net10.0 -czf /tmp/api-integration-tests.tgz . && \
    tar -C tests/Platform.StudentImport.IntegrationTests/bin/Release/net10.0 -czf /tmp/import-integration-tests.tgz . && \
    rm -rf src/Platform.Api/bin src/Platform.Api/obj \
      src/Platform.StudentImport/bin src/Platform.StudentImport/obj \
      tests/Platform.Api.IntegrationTests/bin tests/Platform.Api.IntegrationTests/obj \
      tests/Platform.StudentImport.IntegrationTests/bin tests/Platform.StudentImport.IntegrationTests/obj

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS test-runner
WORKDIR /tests
COPY --from=test-build /tmp/api-integration-tests.tgz /tmp/api-integration-tests.tgz
COPY --from=test-build /tmp/import-integration-tests.tgz /tmp/import-integration-tests.tgz
RUN mkdir /tests/api /tests/import && \
    tar -xzf /tmp/api-integration-tests.tgz -C /tests/api && \
    tar -xzf /tmp/import-integration-tests.tgz -C /tests/import && \
    rm /tmp/api-integration-tests.tgz /tmp/import-integration-tests.tgz
CMD ["dotnet", "vstest", "/tests/api/Platform.Api.IntegrationTests.dll", "/tests/import/Platform.StudentImport.IntegrationTests.dll", "--logger:console;verbosity=normal"]

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS importer-runtime
RUN apt-get update && \
    apt-get install --no-install-recommends -y libgssapi-krb5-2 && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=$APP_UID:$APP_UID --from=importer-build /app/student-importer ./
USER $APP_UID
ENTRYPOINT ["dotnet", "Platform.StudentImport.dll"]

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS homework-importer-runtime
RUN apt-get update && \
    apt-get install --no-install-recommends -y libgssapi-krb5-2 && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=$APP_UID:$APP_UID --from=importer-build /app/homework-importer ./
USER $APP_UID
ENTRYPOINT ["dotnet", "Platform.HomeworkImport.dll"]

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
RUN apt-get update && \
    apt-get install --no-install-recommends -y libgssapi-krb5-2 && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=$APP_UID:$APP_UID --from=build /app/publish ./
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "Platform.Api.dll"]
