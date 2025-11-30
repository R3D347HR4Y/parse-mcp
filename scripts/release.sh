#!/bin/bash

# =============================================================================
# Release Script for Parse MCP Server
# Publishes to GitHub, npm, and Docker Hub
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# =============================================================================
# Helper Functions
# =============================================================================

print_step() {
    echo -e "\n${BLUE}==>${NC} ${1}"
}

print_success() {
    echo -e "${GREEN}✓${NC} ${1}"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} ${1}"
}

print_error() {
    echo -e "${RED}✗${NC} ${1}"
}

confirm() {
    read -r -p "${1} [y/N] " response
    case "$response" in
        [yY][eE][sS]|[yY]) 
            true
            ;;
        *)
            false
            ;;
    esac
}

# =============================================================================
# Version Validation
# =============================================================================

validate_version() {
    if [[ ! $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
        print_error "Invalid version format: $1"
        echo "Expected format: X.Y.Z or X.Y.Z-suffix (e.g., 1.0.0, 1.0.0-beta.1)"
        exit 1
    fi
}

# =============================================================================
# Pre-flight Checks
# =============================================================================

preflight_checks() {
    print_step "Running pre-flight checks..."

    # Check if git is clean
    if [[ -n $(git status --porcelain) ]]; then
        print_warning "You have uncommitted changes:"
        git status --short
        if ! confirm "Continue anyway?"; then
            exit 1
        fi
    fi
    print_success "Git status checked"

    # Check if on main branch
    CURRENT_BRANCH=$(git branch --show-current)
    if [[ "$CURRENT_BRANCH" != "main" && "$CURRENT_BRANCH" != "master" ]]; then
        print_warning "You are on branch '$CURRENT_BRANCH', not main/master"
        if ! confirm "Continue anyway?"; then
            exit 1
        fi
    fi
    print_success "Branch: $CURRENT_BRANCH"

    # Check npm login
    if ! npm whoami &>/dev/null; then
        print_warning "Not logged in to npm"
        echo "Run: npm login"
        if ! confirm "Skip npm publish?"; then
            exit 1
        fi
        SKIP_NPM=true
    else
        NPM_USER=$(npm whoami)
        print_success "npm logged in as: $NPM_USER"
    fi

    # Check Docker login
    if ! docker info &>/dev/null; then
        print_error "Docker is not running"
        exit 1
    fi
    print_success "Docker is running"

    # Check Docker Hub login
    if ! docker system info 2>/dev/null | grep -q "Username"; then
        print_warning "May not be logged in to Docker Hub"
        if ! confirm "Continue anyway?"; then
            exit 1
        fi
    fi
    print_success "Docker Hub checked"
}

# =============================================================================
# Build & Test
# =============================================================================

build_project() {
    print_step "Building project..."
    
    npm ci
    npm run build
    
    print_success "Build complete"
}

# =============================================================================
# Update Version
# =============================================================================

update_version() {
    local version=$1
    
    print_step "Updating version to $version..."

    # Update package.json
    npm version "$version" --no-git-tag-version --allow-same-version
    print_success "Updated package.json"

    # Update Dockerfile version label
    if grep -q 'org.opencontainers.image.version=' Dockerfile; then
        sed -i.bak "s/org.opencontainers.image.version=\"[^\"]*\"/org.opencontainers.image.version=\"$version\"/" Dockerfile
        rm -f Dockerfile.bak
        print_success "Updated Dockerfile labels"
    fi
}

# =============================================================================
# Git Release
# =============================================================================

git_release() {
    local version=$1
    local tag="v$version"

    print_step "Creating Git release..."

    # Stage changes
    git add package.json package-lock.json Dockerfile

    # Commit
    git commit -m "chore: release v$version" || true
    print_success "Changes committed"

    # Create tag
    if git rev-parse "$tag" >/dev/null 2>&1; then
        print_warning "Tag $tag already exists"
        if confirm "Delete and recreate tag?"; then
            git tag -d "$tag"
            git push origin ":refs/tags/$tag" 2>/dev/null || true
        else
            print_error "Cannot continue with existing tag"
            exit 1
        fi
    fi

    git tag -a "$tag" -m "Release $version"
    print_success "Created tag: $tag"

    # Push
    git push origin "$CURRENT_BRANCH"
    git push origin "$tag"
    print_success "Pushed to GitHub"

    echo ""
    echo "📝 Create GitHub Release at:"
    echo "   https://github.com/R3D347HR4Y/parse-mcp/releases/new?tag=$tag"
}

# =============================================================================
# npm Publish
# =============================================================================

npm_publish() {
    if [[ "$SKIP_NPM" == "true" ]]; then
        print_warning "Skipping npm publish (not logged in)"
        return
    fi

    print_step "Publishing to npm..."

    # Check if version already exists
    local pkg_name=$(node -p "require('./package.json').name")
    local version=$(node -p "require('./package.json').version")
    
    if npm view "$pkg_name@$version" version &>/dev/null; then
        print_warning "Version $version already exists on npm"
        if ! confirm "Skip npm publish?"; then
            exit 1
        fi
        return
    fi

    npm publish --access public
    print_success "Published to npm: $pkg_name@$version"
}

# =============================================================================
# Docker Build & Push
# =============================================================================

docker_release() {
    local version=$1
    local image="purpleshow/parse-mcp-server"

    print_step "Building Docker image..."

    docker build \
        -t "$image:latest" \
        -t "$image:$version" \
        -t "$image:$(echo $version | cut -d. -f1-2)" \
        -t "$image:$(echo $version | cut -d. -f1)" \
        .

    print_success "Docker image built"

    print_step "Pushing to Docker Hub..."

    docker push "$image:latest"
    docker push "$image:$version"
    docker push "$image:$(echo $version | cut -d. -f1-2)"
    docker push "$image:$(echo $version | cut -d. -f1)"

    print_success "Pushed to Docker Hub"
    echo "   https://hub.docker.com/r/$image"
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║           Parse MCP Server - Release Script                   ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # Get version from argument or prompt
    VERSION=${1:-}
    
    if [[ -z "$VERSION" ]]; then
        CURRENT_VERSION=$(node -p "require('./package.json').version")
        echo "Current version: $CURRENT_VERSION"
        read -r -p "Enter new version: " VERSION
    fi

    validate_version "$VERSION"

    echo ""
    echo "Release Summary:"
    echo "  Version: $VERSION"
    echo "  Tag: v$VERSION"
    echo "  npm: parse-mcp-server@$VERSION"
    echo "  Docker: purpleshow/parse-mcp-server:$VERSION"
    echo ""

    if ! confirm "Proceed with release?"; then
        echo "Aborted."
        exit 0
    fi

    preflight_checks
    build_project
    update_version "$VERSION"
    git_release "$VERSION"
    npm_publish
    docker_release "$VERSION"

    echo ""
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                    Release Complete! 🎉                       ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo "Published:"
    echo "  📦 npm: https://www.npmjs.com/package/parse-mcp-server"
    echo "  🐳 Docker: https://hub.docker.com/r/purpleshow/parse-mcp-server"
    echo "  🐙 GitHub: https://github.com/R3D347HR4Y/parse-mcp/releases/tag/v$VERSION"
    echo ""
}

main "$@"

