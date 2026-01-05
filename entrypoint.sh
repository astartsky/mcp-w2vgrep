#!/bin/sh
set -e

MODEL_DIR="${MODEL_DIR:-/app/models}"
DOWNLOAD_MODELS="${DOWNLOAD_MODELS:-english}"

# Skip download if explicitly set to "none" or "skip"
if [ "$DOWNLOAD_MODELS" = "none" ] || [ "$DOWNLOAD_MODELS" = "skip" ]; then
    echo "Skipping model download (DOWNLOAD_MODELS=$DOWNLOAD_MODELS)"
    echo "Starting MCP server..."
    exec "$@"
fi

download_model() {
    local lang="$1"
    local url=""
    local filename=""

    case "$lang" in
        english)
            url="https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.en.300.bin.gz"
            filename="english.bin"
            ;;
        russian)
            url="https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.ru.300.bin.gz"
            filename="russian.bin"
            ;;
        *)
            echo "Unknown model: $lang"
            return 1
            ;;
    esac

    local filepath="$MODEL_DIR/$filename"

    if [ -f "$filepath" ]; then
        echo "Model $filename already exists, skipping download"
        return 0
    fi

    echo "Downloading $lang model (~600MB compressed, ~2.3GB uncompressed)..."
    echo "This may take a while on first run..."

    curl -L --progress-bar "$url" | gunzip > "$filepath"

    echo "Model $filename downloaded successfully"
}

# Create model directory if it doesn't exist
mkdir -p "$MODEL_DIR"

# Parse DOWNLOAD_MODELS (comma-separated list) - POSIX compatible
OLD_IFS="$IFS"
IFS=','
for model in $DOWNLOAD_MODELS; do
    # Trim whitespace
    model=$(echo "$model" | tr -d ' ')
    if [ -n "$model" ]; then
        download_model "$model"
    fi
done
IFS="$OLD_IFS"

echo "Starting MCP server..."
exec "$@"
