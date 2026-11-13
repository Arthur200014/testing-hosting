#!/bin/sh
set -eu

# The normal web process applies only pending EF schema migrations before serving requests.
# Explicit admin commands keep their existing behavior; none run during normal startup.
if [ "$#" -eq 0 ]; then
  dotnet /app/Platform.Api.dll --migrate
  exec dotnet /app/Platform.Api.dll
fi

exec dotnet /app/Platform.Api.dll "$@"
