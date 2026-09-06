variable "IMAGE" {
  default = "passed"
}

variable "TAG" {
  default     = ""
  description = "Required for release. Semver, e.g. TAG=1.0.0 docker bake release"
}

function "is_stable_semver" {
  params = [version]
  result = length(regexall("^[0-9]+\\.[0-9]+\\.[0-9]+$", version)) > 0
}

# 1.0.0 → :latest, :1, :1.0, :1.0.0. Prereleases keep only the exact tag.
function "release_tags" {
  params = [image, version]
  result = concat(
    ["${image}:${version}"],
    is_stable_semver(version) ? [
      "${image}:${split(".", version)[0]}.${split(".", version)[1]}",
      "${image}:${split(".", version)[0]}",
      "${image}:latest",
    ] : [],
  )
}

group "default" {
  targets = ["local"]
}

target "local" {
  context     = "."
  dockerfile  = "Dockerfile"
  description = "Current-platform image tagged :local"
  tags        = ["${IMAGE}:local"]
  labels = {
    "org.opencontainers.image.title"       = "passed"
    "org.opencontainers.image.description" = "Share a password with a one-time URL"
    "org.opencontainers.image.licenses"    = "MPL-2.0"
  }
}

# Instantiated only when TAG is set: TAG=1.0.0 docker bake release
target "release" {
  inherits    = ["local"]
  description = "Multi-platform image with SBOM and provenance. Requires TAG."
  matrix = {
    tag = notequal(TAG, "") ? [TAG] : []
  }
  name      = "release"
  tags      = release_tags(IMAGE, tag)
  platforms = ["linux/amd64", "linux/arm64"]
  attest = [
    "type=provenance,mode=max",
    "type=sbom",
  ]
}
