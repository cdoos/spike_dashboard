#!/usr/bin/env bash
# =============================================================================
# SpikeScope — Environment Setup
# =============================================================================
#
# Creates the "viz" conda environment and installs all dependencies needed
# for local development and GPU worker deployment.
#
# Usage:
#   chmod +x setup_env.sh
#   ./setup_env.sh
#
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONDA_ENV_NAME="viz"
PYTHON_VERSION="3.10"
TORCHBCI_DIR="${SCRIPT_DIR}/torchbci"
TORCHBCI_REPO="git@github.com:dongning-ma/torchbci.git"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()  { echo -e "${RED}[ERR]${NC}  $*"; }
step() { echo -e "\n${CYAN}${BOLD}━━━ $* ━━━${NC}\n"; }

# ── Helper: Initialize Conda ─────────────────────────────────────────────────
init_conda() {
  if [ -f "${HOME}/miniconda3/etc/profile.d/conda.sh" ]; then
    source "${HOME}/miniconda3/etc/profile.d/conda.sh"
  elif [ -f "${HOME}/anaconda3/etc/profile.d/conda.sh" ]; then
    source "${HOME}/anaconda3/etc/profile.d/conda.sh"
  elif command -v conda &>/dev/null; then
    return 0
  else
    err "Conda not found. Install Miniconda first:"
    err "  https://docs.conda.io/en/latest/miniconda.html"
    exit 1
  fi
}

# =============================================================================
# 1. System dependencies (Docker, Node.js)
# =============================================================================
setup_system_deps() {
  step "1/5  System dependencies"

  # Docker
  if command -v docker &>/dev/null; then
    ok "Docker already installed: $(docker --version)"
  else
    log "Installing Docker..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker.io
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker "$USER"
    ok "Docker installed (you may need to log out/in for group permissions)"
  fi

  # Node.js
  if command -v node &>/dev/null; then
    ok "Node.js already installed: $(node --version)"
  else
    log "Installing Node.js via conda..."
    init_conda
    conda install -y -c conda-forge nodejs=18
    ok "Node.js installed"
  fi

  # gcloud CLI
  if command -v gcloud &>/dev/null; then
    ok "gcloud CLI already installed: $(gcloud --version 2>&1 | head -1)"
  else
    warn "gcloud CLI not found — needed for Cloud Run deployment"
    warn "Install from: https://cloud.google.com/sdk/docs/install"
  fi
}

# =============================================================================
# 2. Clone/pull torchbci
# =============================================================================
setup_torchbci() {
  step "2/5  torchbci repository"

  if [ -d "${TORCHBCI_DIR}/.git" ]; then
    log "Pulling latest torchbci..."
    (cd "${TORCHBCI_DIR}" && git pull --ff-only) || warn "git pull failed — using existing code"
    ok "torchbci up to date"
  else
    log "Cloning torchbci..."
    git clone "${TORCHBCI_REPO}" "${TORCHBCI_DIR}"
    ok "torchbci cloned"
  fi
}

# =============================================================================
# 3. Conda environment + Python packages
# =============================================================================
setup_conda_env() {
  step "3/5  Conda environment (${CONDA_ENV_NAME})"

  init_conda

  # Create env if it doesn't exist
  if conda env list | grep -qw "${CONDA_ENV_NAME}"; then
    ok "Environment '${CONDA_ENV_NAME}' already exists"
  else
    log "Creating environment '${CONDA_ENV_NAME}' with Python ${PYTHON_VERSION}..."
    conda create -y -n "${CONDA_ENV_NAME}" python="${PYTHON_VERSION}"
    ok "Environment created"
  fi

  conda activate "${CONDA_ENV_NAME}"
  log "Active Python: $(python --version)"

  # PyTorch with CUDA
  if python -c "import torch" &>/dev/null; then
    local torch_ver
    torch_ver=$(python -c "import torch; print(f'{torch.__version__} CUDA={torch.cuda.is_available()}')")
    ok "PyTorch already installed: ${torch_ver}"
  else
    log "Installing PyTorch..."
    if command -v nvidia-smi &>/dev/null; then
      log "CUDA detected — installing PyTorch with CUDA 12.6"
      pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu126 --quiet
    else
      log "No GPU — installing CPU-only PyTorch"
      pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu --quiet
    fi
    ok "PyTorch installed"
  fi

  # Python dependencies
  log "Installing Python dependencies..."
  pip install -r "${SCRIPT_DIR}/requirements.txt" --quiet
  ok "Python dependencies installed"

  # GCP libraries (needed for Cloud Run GPU mode)
  log "Installing GCP libraries..."
  pip install google-cloud-storage google-auth requests --quiet
  ok "GCP libraries installed"

  # torchbci editable install
  if [ -d "${TORCHBCI_DIR}" ]; then
    log "Installing torchbci (editable)..."
    pip install -e "${TORCHBCI_DIR}" --quiet
    ok "torchbci installed"
  else
    warn "torchbci directory not found — skipping"
  fi
}

# =============================================================================
# 4. Frontend dependencies
# =============================================================================
setup_frontend() {
  step "4/5  Frontend dependencies"

  log "Installing npm packages..."
  (cd "${SCRIPT_DIR}" && npm install --silent 2>&1 | tail -3)
  ok "Frontend dependencies installed"
}

# =============================================================================
# 5. Verify everything
# =============================================================================
verify() {
  step "5/5  Verification"

  init_conda
  conda activate "${CONDA_ENV_NAME}"

  echo ""
  echo -e "  Python:       $(python --version 2>&1)"
  echo -e "  PyTorch:      $(python -c 'import torch; print(torch.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
  echo -e "  CUDA:         $(python -c 'import torch; print(torch.cuda.is_available())' 2>/dev/null || echo 'N/A')"
  echo -e "  Flask:        $(python -c 'import flask; print(flask.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
  echo -e "  scikit-learn: $(python -c 'import sklearn; print(sklearn.__version__)' 2>/dev/null || echo 'NOT INSTALLED')"
  echo -e "  torchbci:     $(python -c 'import torchbci; print("OK")' 2>/dev/null || echo 'NOT INSTALLED')"
  echo -e "  Node.js:      $(node --version 2>/dev/null || echo 'NOT INSTALLED')"
  echo -e "  Docker:       $(docker --version 2>/dev/null || echo 'NOT INSTALLED')"
  echo -e "  gcloud:       $(gcloud --version 2>&1 | head -1 2>/dev/null || echo 'NOT INSTALLED')"
  echo ""
}

# =============================================================================
# Main
# =============================================================================
echo ""
echo -e "${CYAN}${BOLD}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║        SpikeScope — Environment Setup             ║${NC}"
echo -e "${CYAN}${BOLD}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

cd "${SCRIPT_DIR}"

setup_system_deps
setup_torchbci
setup_conda_env
setup_frontend
verify

echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Setup complete!${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  To start the app:    ${BOLD}./run.sh --skip-install${NC}"
echo -e "  To deploy GPU worker: ${BOLD}bash deploy/deploy_gpu_worker.sh${NC}"
echo ""
