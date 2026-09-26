# Trixie provides a fixed TeX Live release on both amd64 and arm64.
# Rebuilding may pick up Debian security updates; keep the built image for an
# unchanged toolchain. No packages are installed when compiling documents.
FROM debian:trixie-slim

ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PYTHONIOENCODING=utf-8 \
    TEXMFVAR=/home/vscode/.cache/texmf-var

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        bash \
        biber \
        ca-certificates \
        curl \
        fontconfig \
        fonts-lmodern \
        git \
        gzip \
        latexmk \
        libatomic1 \
        lmodern \
        openssh-client \
        procps \
        python3 \
        tar \
        texlive-bibtex-extra \
        texlive-fonts-recommended \
        texlive-lang-spanish \
        texlive-latex-extra \
        texlive-luatex \
        texlive-xetex \
        xz-utils \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 vscode \
    && useradd --uid 1000 --gid vscode --create-home --shell /bin/bash vscode \
    && mkdir -p /home/vscode/.cache/texmf-var /workspace \
    && chown -R vscode:vscode /home/vscode /workspace

USER vscode
WORKDIR /workspace

# Generate the font database once in the image so a new project does not pay
# this cost on its first LuaLaTeX build. Normal builds retain their build/ cache.
RUN luaotfload-tool --update --force

CMD ["sleep", "infinity"]
