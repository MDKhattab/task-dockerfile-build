import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Layers3,
  Play,
  Search,
  ShieldCheck,
  Terminal,
  Timer,
  X,
  Zap,
} from "lucide-react";
import { jsPDF } from "jspdf";

type Track = "Foundations" | "Production Craft" | "Platform Operations";
type PdfKind = "guide" | "sprint";

type Lesson = {
  id: string;
  title: string;
  track: Track;
  time: string;
  summary: string;
  lens: string;
  practice: string;
  command: string;
  question: {
    prompt: string;
    options: string[];
    answer: number;
    explanation: string;
  };
};

const lessons: Lesson[] = [
  {
    id: "architecture",
    title: "The Docker mental model",
    track: "Foundations",
    time: "12 min",
    summary:
      "The Docker CLI is a client. It sends requests to a Docker Engine API, usually served by dockerd. The Engine works with containerd and an OCI runtime such as runc to create a container. A container is an isolated host process with a filesystem view, not a small virtual machine. Namespaces isolate views of system resources; cgroups account for and limit resource use. Docker Desktop runs Linux containers inside a managed Linux VM on macOS and Windows.",
    lens:
      "The daemon is a security and operational boundary. On a rootful Linux host, access to the Docker socket is effectively host-root access. A Docker context selects which daemon receives a command, so verify the active context before making production changes.",
    practice:
      "Trace the client-to-runtime path on your machine. Compare the reported client, server, storage driver, cgroup driver, and active context. Explain what changes when the daemon is remote.",
    command: "docker version\ndocker info\ndocker context ls\ndocker context show",
    question: {
      prompt: "Which statement best describes a Linux container?",
      options: [
        "A lightweight virtual machine with its own kernel",
        "An isolated process sharing the host kernel",
        "A running copy of an image stored in the registry",
      ],
      answer: 1,
      explanation:
        "A standard Linux container shares the host kernel. Namespaces, cgroups, capabilities, and filesystem isolation shape its boundary; they do not create a separate kernel.",
    },
  },
  {
    id: "lifecycle",
    title: "Container lifecycle and PID 1",
    track: "Foundations",
    time: "14 min",
    summary:
      "A container starts when its configured process starts. If that process exits, the container stops. `docker stop` sends SIGTERM, waits for the grace period, then sends SIGKILL if needed. `docker exec` starts an additional process in a running container; it does not change the image. The process running as PID 1 has special signal and child-reaping behavior, so use exec-form commands and an init process when the workload needs one.",
    lens:
      "A restart policy is recovery behavior, not a health manager. Define what should happen after an exit, make shutdown graceful, and let an orchestrator or external monitor handle a process that is alive but unhealthy.",
    practice:
      "Run a process that handles SIGTERM, then one that ignores it. Observe stop timing, exit codes, and restart-policy behavior. Try `--init` for a workload that spawns child processes.",
    command:
      "docker run -d --name api --restart unless-stopped example/api:1.0\ndocker inspect -f '{{.State.Pid}} {{.State.ExitCode}}' api\ndocker stop --time 20 api\ndocker rm api",
    question: {
      prompt: "What does `docker stop` normally do first?",
      options: [
        "Sends SIGTERM, then SIGKILL after the timeout",
        "Sends SIGKILL immediately and removes the container",
        "Pauses the process and preserves its memory state",
      ],
      answer: 0,
      explanation:
        "Docker gives the process a chance to shut down with SIGTERM. If it has not exited after the configured grace period, Docker sends SIGKILL. Stop does not remove the container.",
    },
  },
  {
    id: "images",
    title: "Images, layers and tags",
    track: "Foundations",
    time: "16 min",
    summary:
      "An image is an immutable manifest plus a set of filesystem layers and configuration. Storage drivers such as overlay2 present shared read-only layers with a per-container writable layer. A tag such as `api:stable` is a mutable name; a digest identifies exact content. Multi-platform images use an image index to point at platform-specific manifests. Deleting a container does not delete its image, and deleting an image does not erase data held in a named volume.",
    lens:
      "Use human-readable, unique release tags for discovery and deploy by digest for identity. Know the storage driver and image-pull policy on your nodes. Container writable layers are disposable and are not a database strategy.",
    practice:
      "Inspect an image, compare its history with its layers, then pull the same image by digest. Start a container, write a file to its writable layer, remove it, and verify what was lost.",
    command:
      "docker image ls --digests\ndocker image inspect nginx:stable\ndocker image history nginx:stable\ndocker image inspect --format '{{.Id}}' nginx:stable",
    question: {
      prompt: "Why is a digest safer than a tag for a deployment reference?",
      options: [
        "A digest always points to the newest security patch",
        "A digest identifies exact image content; a tag can be moved",
        "A digest makes an image private in the registry",
      ],
      answer: 1,
      explanation:
        "Tags are labels and can be reassigned. A digest is content-addressed, which makes the deployed artifact auditable and repeatable. You still need a process to refresh to patched content.",
    },
  },
  {
    id: "networking",
    title: "Container networking and DNS",
    track: "Foundations",
    time: "18 min",
    summary:
      "Bridge is the common single-host network driver. User-defined bridges provide container-name DNS and better isolation than the legacy default bridge. `-p` publishes a container port onto a host address; `EXPOSE` is image metadata and does not publish anything. Host networking removes network-namespace isolation, while `none` disables normal container networking. Overlay networks connect services across Docker Swarm nodes.",
    lens:
      "Publish only the ports that need host ingress, and bind to a specific host interface when appropriate. Keep internal services on private networks. Diagnose from the name-resolution path outward: DNS, route, listener, published port, firewall.",
    practice:
      "Create a user-defined network, attach two containers, and resolve one by name. Compare that with an unpublished service and a published port bound only to loopback.",
    command:
      "docker network create app-net\ndocker run -d --name web --network app-net nginx:stable\ndocker run --rm --network app-net busybox nslookup web\ndocker network inspect app-net",
    question: {
      prompt: "What does `EXPOSE 8080` in a Dockerfile do by itself?",
      options: [
        "Publishes host port 8080 to the container",
        "Adds port metadata; it does not create a host mapping",
        "Opens port 8080 in the host firewall",
      ],
      answer: 1,
      explanation:
        "EXPOSE documents the intended container port in image metadata. Runtime publication is configured separately, for example with `-p 127.0.0.1:8080:8080`.",
    },
  },
  {
    id: "storage",
    title: "Volumes and persistent data",
    track: "Foundations",
    time: "17 min",
    summary:
      "A container writable layer lasts only as long as that container. Named volumes are managed by Docker and are usually the right default for persistent container data. Bind mounts expose a specific host path and are useful for development or deliberate host integration. tmpfs mounts keep ephemeral data in memory. Read/write permissions, UID/GID mapping, backup consistency, and volume lifecycle all need an explicit design.",
    lens:
      "Persistence is not backup. Document the owner, backup frequency, restore test, and retention policy for every important volume. Treat `docker volume prune` and `docker system prune --volumes` as destructive operations.",
    practice:
      "Persist a small database in a named volume, recreate its container, then restore the volume to a second container. Test a backup and restore rather than relying on a successful mount.",
    command:
      "docker volume create app-data\ndocker run --mount type=volume,src=app-data,dst=/var/lib/app alpine:3.20\ndocker volume inspect app-data\ndocker volume ls",
    question: {
      prompt: "Which storage choice is the usual default for durable container data?",
      options: [
        "The container writable layer",
        "A Docker-managed named volume",
        "A tmpfs mount",
      ],
      answer: 1,
      explanation:
        "Named volumes are managed independently from a container's writable layer. They still need backups, restore testing, and a deliberate deletion policy.",
    },
  },
  {
    id: "dockerfile",
    title: "Dockerfile craftsmanship",
    track: "Production Craft",
    time: "20 min",
    summary:
      "A Dockerfile is a build recipe, not a startup script. Order stable dependency inputs before frequently changing source to preserve cache. Use multi-stage builds to separate build tools from runtime artifacts, a deliberate base-image version, `.dockerignore`, and a non-root runtime user. Prefer exec-form ENTRYPOINT and CMD. `ARG` and `ENV` are not secret stores, and every copied file becomes part of the build context unless excluded.",
    lens:
      "Optimize for a reproducible, reviewable artifact before optimizing for the smallest possible byte count. Pin and regularly refresh base images; record build inputs; make the final stage's user, entrypoint, writable paths, and signal behavior explicit.",
    practice:
      "Build the same small app twice. Change only application source and measure what rebuilds. Add a `.dockerignore`, split dependency installation from source copy, and compare the final runtime image with the builder stage.",
    command:
      "# .dockerignore\n.git\n.env\nnode_modules\ncoverage\n\n# Build and inspect the result\ndocker build --progress=plain -t api:dev .\ndocker image history api:dev",
    question: {
      prompt: "What is the primary reason to copy dependency manifests before source code?",
      options: [
        "To keep dependency installation cacheable when source changes",
        "To make the image's layers writable at runtime",
        "To publish the container port automatically",
      ],
      answer: 0,
      explanation:
        "If dependency manifests change less often than application source, placing them first lets the dependency-install layer be reused for source-only changes.",
    },
  },
  {
    id: "buildkit",
    title: "BuildKit, buildx and cache",
    track: "Production Craft",
    time: "22 min",
    summary:
      "BuildKit is Docker's modern build engine. Buildx exposes builders, multi-platform output, Bake, and cache import/export. Dockerfile mounts provide cache directories, temporary bind mounts, SSH agents, and build secrets without copying those materials into a layer. Cross-platform builds may use emulation or native builders. Build attestations can attach an SBOM and provenance to the output; a consumer still needs policy to verify and act on that metadata.",
    lens:
      "Treat the builder as part of the supply chain. Separate the build context, never pass credentials in ARG or COPY, scope cache access, and prove which source and builder produced the artifact. A cache is a performance aid, not a trusted source of truth by default.",
    practice:
      "Create a Buildx builder, add a package-manager cache mount, then build for amd64 and arm64 with an external cache. Inspect the resulting index and enable SBOM and provenance attestations.",
    command:
      "docker buildx create --name ci-builder --use\ndocker buildx build --platform linux/amd64,linux/arm64 --sbom=true --provenance=true --push -t registry.example/api:1.4.2 .\ndocker buildx imagetools inspect registry.example/api:1.4.2",
    question: {
      prompt: "How should a build access a private package token?",
      options: [
        "Pass it as a Dockerfile ARG",
        "Copy it into a temporary build layer, then delete it",
        "Use a BuildKit secret mount scoped to the build step",
      ],
      answer: 2,
      explanation:
        "BuildKit secret mounts make a secret available to a specific build instruction without baking it into image layers. ARG values can appear in build metadata or history.",
    },
  },
  {
    id: "compose",
    title: "Compose for multi-service systems",
    track: "Production Craft",
    time: "20 min",
    summary:
      "Compose describes a multi-container application as services, networks, volumes, and configuration. It is excellent for repeatable local environments, integration tests, and some single-host deployments. Use profiles for optional services and health checks for readiness. Short-form `depends_on` expresses startup ordering, not application readiness; `condition: service_healthy` can gate startup on a health check. File-backed Compose secrets are not equivalent to a managed production secret service.",
    lens:
      "A Compose file is a desired local topology, not a high-availability control plane. Keep development and production concerns explicit, make service health meaningful, and avoid assuming that startup ordering guarantees dependency recovery.",
    practice:
      "Compose an API, database, named data volume, and private network. Add a database health check and make the API wait for `service_healthy`. Test `up`, a failed health check, restart, and `down` with and without volume removal.",
    command:
      "docker compose config\ndocker compose up --build -d\ndocker compose ps\ndocker compose logs --tail=100 -f api\ndocker compose down",
    question: {
      prompt: "What does `depends_on` with `condition: service_healthy` add?",
      options: [
        "A dependency wait based on its configured health check",
        "A guarantee that the dependency will never fail later",
        "A cluster scheduler that reschedules services across hosts",
      ],
      answer: 0,
      explanation:
        "Compose can wait for the dependency's health check before starting the dependent service. It does not guarantee ongoing availability or replace application-level retries.",
    },
  },
  {
    id: "registry",
    title: "Registries and artifact identity",
    track: "Production Craft",
    time: "18 min",
    summary:
      "A registry stores and distributes image manifests, layers, and related metadata. Authentication, repository permissions, retention, replication, and rate limits are operational concerns. Tags are convenient discovery labels; digests provide immutable references. A multi-platform tag may resolve to an image index. Promotion should move the same built artifact through environments rather than silently rebuilding different bits for production.",
    lens:
      "Make artifact identity visible in release records. Prefer digest-based deployment, restrict push and pull identities, scan on a defined cadence, and set retention rules that preserve rollback candidates without keeping unbounded junk.",
    practice:
      "Push a versioned image, inspect its manifest, pull it by digest, and compare the local image ID. Write down how a release would be promoted and rolled back without a rebuild.",
    command:
      "docker login ghcr.io\ndocker buildx build --push -t ghcr.io/acme/api:1.4.2 .\ndocker buildx imagetools inspect ghcr.io/acme/api:1.4.2\ndocker pull ghcr.io/acme/api@sha256:<digest>",
    question: {
      prompt: "What should move from staging to production when you promote a release?",
      options: [
        "The exact same artifact, identified by its digest",
        "A new build from the same tag name",
        "Only the Dockerfile, rebuilt with latest dependencies",
      ],
      answer: 0,
      explanation:
        "Promote the exact artifact and record its digest. Rebuilding can resolve different dependencies or produce different bytes even if the source tag is unchanged.",
    },
  },
  {
    id: "security",
    title: "Container security boundaries",
    track: "Production Craft",
    time: "22 min",
    summary:
      "Harden the host, daemon, build pipeline, image, and runtime together. Run as a non-root user; drop unnecessary Linux capabilities; keep the default seccomp profile unless there is a reviewed reason to change it; use AppArmor or SELinux where available; and set resource limits. Rootless mode runs both daemon and containers without host root, while user-namespace remapping changes container UID/GID mappings. Neither removes the need for patching and defense in depth.",
    lens:
      "Never mount the Docker socket into an untrusted workload. Avoid `--privileged`, host PID/network modes, and writable host mounts unless the risk is understood. Read-only filesystems and narrowly scoped writable tmpfs mounts reduce impact, but can require application changes.",
    practice:
      "Run a test image as a numeric non-root user with a read-only root filesystem, dropped capabilities, no-new-privileges, and CPU, memory, and PID limits. Identify which writes the app still needs.",
    command:
      "docker run --read-only --cap-drop=ALL --security-opt=no-new-privileges:true --pids-limit=128 --memory=256m --user=10001:10001 api@sha256:<digest>\ndocker info --format '{{json .SecurityOptions}}'",
    question: {
      prompt: "Why is mounting `/var/run/docker.sock` into a container high risk?",
      options: [
        "The socket grants control over the Docker daemon and often the host",
        "The socket disables image-layer caching",
        "The socket makes container DNS public",
      ],
      answer: 0,
      explanation:
        "A process with access to a rootful Docker socket can ask the daemon to create privileged containers or mount host paths. Treat socket access as highly privileged host access.",
    },
  },
  {
    id: "observability",
    title: "Health, logs and events",
    track: "Production Craft",
    time: "18 min",
    summary:
      "A health check answers whether a configured check considers a container healthy; it is different from whether the process is running. `docker logs` reads the container's configured logging driver output when supported. Events expose lifecycle changes, while inspect shows detailed configuration and state. For production, route logs to a managed backend, set retention and rotation, and connect container identity to application metrics and traces.",
    lens:
      "A health check must measure useful readiness, fail within a known window, and avoid overwhelming the service. Do not make it a substitute for user-facing synthetic checks or service-level objectives.",
    practice:
      "Add a health check to a small service, force it to fail, inspect the health history, and watch Docker events. Configure log rotation and find the same event in your chosen central logging path.",
    command:
      "docker inspect --format '{{json .State.Health}}' api\ndocker logs --since=10m --timestamps api\ndocker events --since=10m\ndocker stats --no-stream",
    question: {
      prompt: "What does a container health check tell you?",
      options: [
        "Whether the configured health command currently passes",
        "Whether the whole application meets its SLO",
        "Whether the image has no known vulnerabilities",
      ],
      answer: 0,
      explanation:
        "A health check reports the result of a configured command. It is one signal; it is not a complete application SLO, security scan, or guarantee of user-visible correctness.",
    },
  },
  {
    id: "resources",
    title: "Resource control and performance",
    track: "Production Craft",
    time: "17 min",
    summary:
      "Containers share a host kernel, so resource boundaries matter. Memory limits can trigger an OOM kill; CPU limits throttle work; CPU shares or weights influence contention; PID limits prevent process explosions. cgroup v1/v2 behavior and kernel support affect what is available. Image size, cold starts, filesystem writes, network overhead, and log volume also shape production performance.",
    lens:
      "A limit is not a capacity plan. Load-test representative workloads, observe throttling and memory pressure, reserve headroom, and understand how an OOM kill affects restarts and data integrity. Verify that the host cgroup configuration honors the requested limits.",
    practice:
      "Run a controlled CPU and memory workload with and without limits. Compare `docker stats`, host cgroup counters, latency, and exit state. Document a tested request, limit, and alert threshold.",
    command:
      "docker run --cpus=1.5 --memory=512m --memory-swap=512m --pids-limit=256 api:dev\ndocker stats --no-stream\ndocker inspect --format '{{.State.OOMKilled}} {{.State.ExitCode}}' <container>",
    question: {
      prompt: "What does a CPU quota primarily do when a process exceeds its allowance?",
      options: [
        "Throttles execution until the next scheduling period",
        "Raises the process priority above the host",
        "Converts the container into a virtual machine",
      ],
      answer: 0,
      explanation:
        "CPU quota is enforced through cgroups and can throttle a workload. It is not a reservation of dedicated cores and can affect latency under contention.",
    },
  },
  {
    id: "daemon",
    title: "Contexts, daemon and host operations",
    track: "Platform Operations",
    time: "18 min",
    summary:
      "Docker contexts package endpoint and TLS configuration for a Docker daemon. They make remote operations convenient, but do not grant authorization by themselves. The daemon configuration file controls selected host-wide settings such as data root, logging defaults, and insecure registries. The daemon socket, API exposure, systemd service, firewall, storage pressure, and upgrades belong to host operations.",
    lens:
      "Use SSH or mutually authenticated TLS for remote Engine access; never expose an unauthenticated Docker API on a public interface. Keep access least-privileged, audit context changes, and monitor disk use under Docker's data root before cleanup becomes urgent.",
    practice:
      "Create a context over SSH to a test host. Confirm the active endpoint before and after switching. Inspect daemon storage, service logs, and configuration without making an unreviewed production change.",
    command:
      "docker context create staging --docker 'host=ssh://ops@node-01'\ndocker context ls\ndocker context use staging\ndocker system df -v\ndocker context use default",
    question: {
      prompt: "What does a Docker context primarily select?",
      options: [
        "The daemon endpoint and connection settings for the CLI",
        "A container's Linux namespace configuration",
        "The active image tag in every registry",
      ],
      answer: 0,
      explanation:
        "A context tells the CLI which Docker endpoint and connection settings to use. It is not a security policy or a container runtime profile.",
    },
  },
  {
    id: "swarm",
    title: "Swarm mode and orchestration",
    track: "Platform Operations",
    time: "20 min",
    summary:
      "Docker Swarm mode provides native clustering: managers maintain desired service state, workers run tasks, overlay networks span nodes, and services support replica counts and rolling updates. It is useful for learning scheduler concepts and for some smaller Docker-native deployments. Swarm is a different operational choice from Kubernetes; it does not become Kubernetes through a Compose file, and its ecosystem and support model should be evaluated against current platform requirements.",
    lens:
      "Understand manager quorum, node availability, overlay networking, secrets, update and rollback behavior, and backup/restore before calling a cluster production-ready. A single-manager cluster is a single control-plane failure point.",
    practice:
      "Build a three-node lab, deploy a replicated service, drain a worker, update the service, and roll it back. Observe how desired state is reconciled after a task exits.",
    command:
      "docker swarm init\ndocker service create --name api --replicas 3 --publish published=8080,target=8080 api:1.0\ndocker service update --image api:1.1 --update-parallelism 1 --update-delay 10s api\ndocker service ps api",
    question: {
      prompt: "What is the central idea behind a Swarm service?",
      options: [
        "A desired state that the manager reconciles into running tasks",
        "A Dockerfile layer that starts only once",
        "A registry repository shared by every worker",
      ],
      answer: 0,
      explanation:
        "A service expresses desired state, such as image and replica count. The Swarm managers schedule tasks and reconcile them as cluster conditions change.",
    },
  },
  {
    id: "automation",
    title: "CI/CD and software supply chain",
    track: "Platform Operations",
    time: "21 min",
    summary:
      "A mature container pipeline tests source, builds once, scans dependencies and image layers, creates provenance and an SBOM, signs or attests the result, publishes it to a controlled registry, and deploys by digest. Buildx Bake can describe coordinated builds. Use short-lived credentials, isolated builders, protected release environments, and policy checks that verify the provenance and signature at deployment time.",
    lens:
      "A green build is not proof of a trustworthy artifact. Know who can change the builder, which secrets it can access, what the attestation actually claims, where results are stored, and how deployment policy validates them.",
    practice:
      "Design a pipeline diagram that promotes one digest from test to production. Add a failed vulnerability-policy case, a revoked signing identity case, and an auditable rollback path.",
    command:
      "docker buildx build --sbom=true --provenance=true --push -t registry.example/api:${GIT_SHA} .\ndocker buildx imagetools inspect registry.example/api:${GIT_SHA}\n# Verify policy and signature before deployment; pin the resolved digest.",
    question: {
      prompt: "Why generate both an SBOM and build provenance?",
      options: [
        "They describe different evidence: contents and build origin",
        "They replace image patching and runtime isolation",
        "They make a mutable tag immutable",
      ],
      answer: 0,
      explanation:
        "An SBOM describes software components. Provenance describes how an artifact was produced. Both need verification and policy; neither replaces patching or runtime controls.",
    },
  },
  {
    id: "capstone",
    title: "Capstone: ship a production service",
    track: "Platform Operations",
    time: "45 min",
    summary:
      "Build a two-service API and database system from source through an operational release. Use a multi-stage Dockerfile, a narrow build context, non-root runtime, Compose health checks, a named data volume, and a private service network. Build for your target platforms, publish one immutable artifact, attach provenance and an SBOM, and deploy by digest. Write down resource limits, logs, backup and restore, secrets, rollback, and incident steps.",
    lens:
      "The senior-level test is not whether `docker run` works. It is whether another engineer can reproduce the artifact, understand its privileges, recover its data, diagnose a failure, and roll back without guessing.",
    practice:
      "Deliver the Dockerfile, `.dockerignore`, Compose file, pipeline outline, release digest, threat notes, resource budget, restore evidence, and a one-page runbook. Break the database health check and prove your runbook finds the cause.",
    command:
      "docker compose config\ndocker compose up --build -d\ndocker compose ps\ndocker compose logs --since=10m\ndocker compose down\n# Restore the named volume from a tested backup before declaring recovery complete.",
    question: {
      prompt: "What is the strongest capstone release evidence?",
      options: [
        "A screenshot showing that the app starts on one laptop",
        "A tested, traceable digest plus security, recovery, and operations evidence",
        "A Dockerfile with the fewest possible lines",
      ],
      answer: 1,
      explanation:
        "Senior delivery includes traceability, least privilege, a tested restore path, observability, and a credible rollback. A successful local start proves only a small part of readiness.",
    },
  },
];

const tracks: Array<Track | "All modules"> = [
  "All modules",
  "Foundations",
  "Production Craft",
  "Platform Operations",
];

const sprintDays = [
  {
    day: "01",
    title: "See the system",
    duration: "1 hr 45 min",
    ids: ["architecture", "lifecycle", "images"],
    focus: "Engine, process lifecycle, image identity",
    mission: "Explain the path from CLI request to an isolated process.",
  },
  {
    day: "02",
    title: "Build reproducibly",
    duration: "2 hours",
    ids: ["dockerfile", "buildkit"],
    focus: "Dockerfile design, cache, multi-platform builds",
    mission: "Produce a small, non-root image with a traceable build.",
  },
  {
    day: "03",
    title: "Connect and persist",
    duration: "2 hours",
    ids: ["networking", "storage", "compose"],
    focus: "DNS, ports, volumes, Compose dependencies",
    mission: "Run a healthy API and database with durable data.",
  },
  {
    day: "04",
    title: "Harden and observe",
    duration: "2 hr 15 min",
    ids: ["registry", "security", "observability", "resources"],
    focus: "Artifact delivery, security, health, logs, limits",
    mission: "Apply runtime controls and diagnose a forced failure.",
  },
  {
    day: "05",
    title: "Operate and ship",
    duration: "2 hours",
    ids: ["daemon", "swarm", "automation", "capstone"],
    focus: "Remote Engine, orchestration, CI/CD, capstone",
    mission: "Publish, verify, deploy, recover, and explain the trade-offs.",
  },
];

const releaseChecks = [
  "Base images are intentional, refreshed on a schedule, and recorded by version or digest.",
  "Build context is narrow; multi-stage build keeps tools and source out of the runtime image.",
  "Runtime uses a non-root identity and does not need privileged mode or the Docker socket.",
  "Capabilities, writable paths, network access, and secrets are explicitly scoped.",
  "CPU, memory, PID, health-check, restart, and log-retention behavior are defined and tested.",
  "Persistent data has an owner, tested backup and restore, and a safe cleanup policy.",
  "Release is scanned, has an SBOM and provenance, and is deployed by immutable digest.",
  "Rollback, incident commands, and the active Docker context are clear to the on-call engineer.",
];

function DockerMark() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className="brand-mark">
      <path d="M8 12h7v7H8zM17 12h7v7h-7zM26 12h7v7h-7zM17 21h7v7h-7zM26 21h7v7h-7zM8 21h7v7H8z" fill="currentColor" />
      <path d="M4 30c2.4 4.2 6.7 6.4 13.6 6.4 9.1 0 14.9-4.1 17.1-11.8" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
    </svg>
  );
}

function ArchitectureDiagram() {
  return (
    <svg className="architecture-diagram" viewBox="0 0 760 500" role="img" aria-label="Diagram of the Docker client, Engine, runtime and isolated containers">
      <defs>
        <pattern id="dot-grid" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#304038" />
        </pattern>
        <linearGradient id="host-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b2821" />
          <stop offset="1" stopColor="#121b17" />
        </linearGradient>
      </defs>
      <rect width="760" height="500" fill="url(#dot-grid)" opacity=".5" />
      <path className="diagram-orbit" d="M42 376h675M70 80v340" />

      <g className="diagram-label">
        <text x="46" y="109">OPERATOR</text>
        <text x="46" y="132" className="diagram-bright">docker CLI</text>
        <text x="46" y="151">context + API request</text>
      </g>
      <rect x="34" y="84" width="172" height="89" rx="3" className="diagram-node" />

      <motion.path
        d="M206 128h72"
        fill="none"
        stroke="#c9f65a"
        strokeWidth="2"
        strokeDasharray="6 7"
        initial={{ pathLength: 0, opacity: 0.25 }}
        animate={{ pathLength: 1, opacity: 0.8 }}
        transition={{ duration: 1.2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", repeatDelay: 1 }}
      />
      <motion.circle cx="0" cy="128" r="4" fill="#c9f65a" animate={{ cx: [207, 269] }} transition={{ duration: 1.2, ease: "linear", repeat: Infinity, repeatType: "reverse", repeatDelay: 1 }} />

      <rect x="278" y="47" width="444" height="390" rx="5" className="diagram-host" />
      <text x="302" y="75" className="diagram-host-label">DOCKER HOST / LINUX KERNEL</text>
      <text x="302" y="106" className="diagram-host-title">Engine API</text>
      <text x="302" y="126" className="diagram-caption">dockerd manages objects and state</text>

      <rect x="301" y="151" width="396" height="59" rx="3" className="diagram-engine" />
      <text x="320" y="176" className="diagram-small-label">CONTAINER MANAGEMENT</text>
      <text x="320" y="196" className="diagram-strong">containerd</text>
      <path d="M470 180h50" className="diagram-arrow" />
      <text x="540" y="176" className="diagram-small-label">OCI RUNTIME</text>
      <text x="540" y="196" className="diagram-strong">runc</text>

      <path d="M499 210v24M355 234h291" className="diagram-wire" />
      <path d="M355 234v17M500 234v17M646 234v17" className="diagram-wire" />

      <g>
        <rect x="301" y="252" width="126" height="145" rx="3" className="diagram-container" />
        <text x="317" y="278" className="diagram-small-label">CONTAINER 01</text>
        <text x="317" y="308" className="diagram-strong">process</text>
        <text x="317" y="329" className="diagram-caption">namespace</text>
        <text x="317" y="347" className="diagram-caption">cgroup limits</text>
        <path d="M317 366h88" className="diagram-layer" />
        <path d="M317 375h67" className="diagram-layer diagram-layer-muted" />
      </g>
      <g>
        <rect x="438" y="252" width="126" height="145" rx="3" className="diagram-container diagram-container-active" />
        <text x="454" y="278" className="diagram-small-label">CONTAINER 02</text>
        <text x="454" y="308" className="diagram-strong">process</text>
        <text x="454" y="329" className="diagram-caption">namespace</text>
        <text x="454" y="347" className="diagram-caption">cgroup limits</text>
        <path d="M454 366h88" className="diagram-layer diagram-layer-active" />
        <path d="M454 375h67" className="diagram-layer diagram-layer-muted" />
      </g>
      <g>
        <rect x="575" y="252" width="122" height="145" rx="3" className="diagram-container" />
        <text x="591" y="278" className="diagram-small-label">CONTAINER 03</text>
        <text x="591" y="308" className="diagram-strong">process</text>
        <text x="591" y="329" className="diagram-caption">namespace</text>
        <text x="591" y="347" className="diagram-caption">cgroup limits</text>
        <path d="M591 366h85" className="diagram-layer" />
        <path d="M591 375h59" className="diagram-layer diagram-layer-muted" />
      </g>
      <text x="44" y="411" className="diagram-footnote">ONE KERNEL / ISOLATED WORKLOADS</text>
      <text x="634" y="462" className="diagram-version">01 / 04</text>
    </svg>
  );
}

function readList(key: string, fallback: string[]) {
  try {
    const value = localStorage.getItem(key);
    const parsed: unknown = value ? JSON.parse(value) : fallback;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function buildStudyPdf(kind: PdfKind) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 18;
  const textWidth = pageWidth - margin * 2;
  let y = 25;

  doc.setProperties({
    title: kind === "guide" ? "Docker Senior Engineer Field Guide" : "Docker Five-Day Rapid Sprint",
    subject: "A practical Docker study guide for DevOps engineers",
    author: "Docker Field Guide",
    keywords: "Docker, DevOps, containers, BuildKit, Compose, security",
  });

  doc.setFillColor(15, 23, 19);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(202, 245, 88);
  doc.rect(margin, 27, 10, 10, "F");
  doc.setTextColor(202, 245, 88);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("DOCKER / FIELD GUIDE", margin + 16, 34);
  doc.setTextColor(244, 246, 238);
  doc.setFontSize(38);
  doc.text(kind === "guide" ? "Operate the" : "A five-day", margin, 105);
  doc.setTextColor(202, 245, 88);
  doc.setFontSize(42);
  doc.text(kind === "guide" ? "whole system." : "Docker sprint.", margin, 123);
  doc.setDrawColor(70, 86, 73);
  doc.setLineWidth(0.4);
  doc.line(margin, 139, pageWidth - margin, 139);
  doc.setTextColor(198, 207, 197);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  const coverCopy = kind === "guide"
    ? "A senior engineer's working guide to Docker Engine, images, BuildKit, networking, security, operations and delivery."
    : "Ten focused study hours, five practical outcomes, one production-minded capstone."
  ;
  doc.text(doc.splitTextToSize(coverCopy, 133), margin, 157);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(202, 245, 88);
  doc.text(kind === "guide" ? "16 LESSONS  /  3 TRACKS  /  1 CAPSTONE" : "FOUNDATIONS  /  PRODUCTION  /  OPERATIONS", margin, 214);
  doc.setTextColor(198, 207, 197);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Read with a terminal open. Verify each idea against your own Docker Engine version.", margin, 227);
  doc.setDrawColor(70, 86, 73);
  doc.line(margin, 267, pageWidth - margin, 267);
  doc.setFontSize(8);
  doc.text("DOCKER FIELD GUIDE  /  PRACTICAL STUDY EDITION", margin, 276);

  const drawPageHeader = () => {
    doc.setFillColor(249, 250, 246);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(32, 49, 39);
    doc.text("DOCKER / FIELD GUIDE", margin, 14);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(102, 114, 104);
    doc.text(kind === "guide" ? "SENIOR ENGINEER TRACK" : "ACCELERATED STUDY PLAN", pageWidth - margin, 14, { align: "right" });
    doc.setDrawColor(213, 220, 210);
    doc.line(margin, 18, pageWidth - margin, 18);
    y = 28;
  };

  const nextPage = () => {
    doc.addPage();
    drawPageHeader();
  };

  const ensureSpace = (height: number) => {
    if (y + height > 278) nextPage();
  };

  const heading = (text: string, level: "section" | "sub" = "section") => {
    const fontSize = level === "section" ? 17 : 10;
    ensureSpace(level === "section" ? 15 : 9);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize);
    doc.setTextColor(level === "section" ? 26 : 78, level === "section" ? 43 : 96, level === "section" ? 33 : 81);
    const lines = doc.splitTextToSize(text, textWidth);
    lines.forEach((line: string) => {
      ensureSpace(6);
      doc.text(line, margin, y);
      y += level === "section" ? 7 : 5;
    });
    if (level === "section") {
      doc.setDrawColor(202, 245, 88);
      doc.setLineWidth(1.1);
      doc.line(margin, y, margin + 18, y);
      y += 6;
    } else {
      y += 1;
    }
  };

  const paragraph = (text: string, size = 9.5) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(66, 77, 68);
    const lines = doc.splitTextToSize(text, textWidth) as string[];
    const lineHeight = size * 0.48;
    lines.forEach((line) => {
      ensureSpace(lineHeight + 0.5);
      doc.text(line, margin, y);
      y += lineHeight;
    });
    y += 2;
  };

  const bullet = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.3);
    doc.setTextColor(66, 77, 68);
    const lines = doc.splitTextToSize(`- ${text}`, textWidth - 2) as string[];
    lines.forEach((line) => {
      ensureSpace(5);
      doc.text(line, margin + 2, y);
      y += 4.7;
    });
    y += 1;
  };

  const code = (text: string) => {
    doc.setFont("courier", "normal");
    doc.setFontSize(7.4);
    const lines = text.split("\n").flatMap((line) => doc.splitTextToSize(line || " ", textWidth - 12) as string[]);
    const lineHeight = 4.1;
    const boxHeight = lines.length * lineHeight + 8;
    ensureSpace(boxHeight + 2);
    doc.setFillColor(22, 31, 26);
    doc.rect(margin, y - 3, textWidth, boxHeight, "F");
    doc.setTextColor(207, 242, 131);
    lines.forEach((line) => {
      doc.text(line, margin + 6, y + 2);
      y += lineHeight;
    });
    y += 7;
    doc.setTextColor(66, 77, 68);
  };

  const label = (text: string) => {
    ensureSpace(7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(107, 132, 67);
    doc.text(text.toUpperCase(), margin, y);
    y += 5;
  };

  nextPage();

  if (kind === "guide") {
    heading("How to use this guide");
    paragraph("This is a concept-to-operations reference, not a substitute for hands-on work. Read one lesson, run the commands on a disposable host, record what changed, and explain the trade-offs in your own words.");
    bullet("Use a non-production Docker host for cleanup, privilege, networking and storage experiments.");
    bullet("Use unique tags while testing and digests for release identity. Never put real credentials in example files or build arguments.");
    bullet("Check the current Docker Engine and Compose documentation for version-specific behavior.");

    heading("The accelerated route");
    sprintDays.forEach((day) => {
      heading(`Day ${day.day} / ${day.title} / ${day.duration}`, "sub");
      paragraph(`${day.focus}. Mission: ${day.mission}`);
    });

    heading("The Docker execution path");
    paragraph("A CLI command targets the daemon selected by the active context. The Docker Engine API asks dockerd to manage an object. The Engine coordinates image, network, volume and container state with containerd; an OCI runtime such as runc creates the isolated process. On Linux, the process shares the host kernel and receives namespaces, cgroups, a layered filesystem view and selected security controls. Docker Desktop places Linux containers inside a managed Linux VM on macOS and Windows.");
    code("CLI + context -> Engine API -> dockerd -> containerd -> OCI runtime -> isolated process\nImage manifest + layers -> container filesystem view\nNamespaces isolate; cgroups account for and limit resources.");
    paragraph("The exact internal architecture evolves. Learn the boundaries and verify the behavior of the Engine version you operate.");

    heading("Lesson reference");
    lessons.forEach((lesson, index) => {
      heading(`${String(index + 1).padStart(2, "0")} / ${lesson.title}`, "sub");
      paragraph(lesson.summary);
      label("Senior engineer lens");
      paragraph(lesson.lens);
      label("Practice");
      paragraph(lesson.practice);
      code(lesson.command);
      ensureSpace(4);
    });

    heading("Production release gate");
    releaseChecks.forEach((item) => bullet(item));

    heading("Command desk reference");
    code([
      "docker ps -a                       # list containers",
      "docker inspect <name>              # inspect effective state",
      "docker logs --since=10m <name>     # recent application output",
      "docker events --since=10m          # daemon event stream",
      "docker stats --no-stream           # resource snapshot",
      "docker system df -v                # Docker disk usage",
      "docker compose config              # render Compose configuration",
      "docker buildx imagetools inspect <image:tag>",
      "docker context show                # verify the target daemon",
      "docker system prune                # review scope before cleanup",
    ].join("\n"));
    paragraph("Destructive cleanup warning: `docker system prune --volumes` can remove unused volumes and their data. Inspect what is unused, confirm backup and retention requirements, and use production change controls before pruning.");

    heading("Core vocabulary");
    [
      "Image: immutable manifest and filesystem layers used to create containers.",
      "Container: an isolated process with configured mounts, network and security controls.",
      "Registry: a service that stores and distributes image manifests, layers and metadata.",
      "Digest: content-addressed identifier for an artifact; tags can be reassigned.",
      "Build context: files available to the builder; `.dockerignore` limits what is sent.",
      "SBOM: inventory of software components associated with an artifact.",
      "Provenance: evidence describing how an artifact was produced.",
      "Health check: result of a configured check; not an application SLO by itself.",
    ].forEach(bullet);

    heading("Official references");
    [
      "Docker Engine: https://docs.docker.com/engine/",
      "Dockerfile reference: https://docs.docker.com/reference/dockerfile/",
      "Buildx reference: https://docs.docker.com/reference/cli/docker/buildx/build/",
      "Compose documentation: https://docs.docker.com/compose/",
      "Docker security: https://docs.docker.com/engine/security/",
    ].forEach(bullet);
  } else {
    heading("How to run the sprint");
    paragraph("Plan for about two focused hours each day. Keep a scratch repository and a short engineering journal. Every session ends with a working artifact, a failure experiment, and a written explanation of the trade-off.");
    bullet("Use a disposable Linux VM or an isolated Docker Desktop environment for host-level experiments.");
    bullet("Start each day by recalling yesterday's key ideas without notes; end by teaching one concept back.");
    bullet("If an exercise runs long, preserve the concept and evidence instead of skipping the failure test.");

    sprintDays.forEach((day) => {
      heading(`Day ${day.day} / ${day.title}`);
      label(`${day.duration} / focus`);
      paragraph(day.focus);
      label("Study and lab");
      day.ids.forEach((id) => {
        const lesson = lessons.find((item) => item.id === id);
        if (lesson) bullet(`${lesson.title}: ${lesson.practice}`);
      });
      label("Mission");
      paragraph(day.mission);
      const dayLessons = day.ids.map((id) => lessons.find((item) => item.id === id)).filter((item): item is Lesson => Boolean(item));
      if (dayLessons.length) code(dayLessons[0].command);
      label("Definition of done");
      paragraph("A reproducible command log, one observed failure mode, and a concise explanation of the operational risk and mitigation.");
    });

    heading("Final capstone brief");
    paragraph("Containerize a small API and database as a reproducible release. Use a multi-stage image, a narrow build context, non-root runtime, health checks, a private service network, a named data volume and explicit resource limits. Build for the target platforms, attach an SBOM and provenance, publish once, and deploy by digest.");
    bullet("Prove rollback using the previous digest without rebuilding it.");
    bullet("Back up and restore the database volume; retain evidence of the restore test.");
    bullet("Break readiness or connectivity on purpose, then diagnose with inspect, logs and events.");
    bullet("Write a short threat model, on-call runbook, cleanup policy and update cadence.");
    heading("After the five days");
    paragraph("Repeat the capstone on the runtime you actually operate. Add your organization's registry, identity, network, backup, monitoring and policy controls. Senior proficiency comes from making these boundaries explicit and practicing safe recovery, not from memorizing flags.");
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 2; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(213, 220, 210);
    doc.line(margin, 284, pageWidth - margin, 284);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(115, 124, 116);
    doc.text("DOCKER FIELD GUIDE  /  STUDY, TEST, VERIFY", margin, 290);
    doc.text(`${String(page).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`, pageWidth - margin, 290, { align: "right" });
  }

  doc.save(kind === "guide" ? "docker-senior-engineer-field-guide.pdf" : "docker-five-day-rapid-sprint.pdf");
}

export default function App() {
  const [activeId, setActiveId] = useState("architecture");
  const [activeTrack, setActiveTrack] = useState<Track | "All modules">("All modules");
  const [search, setSearch] = useState("");
  const [completed, setCompleted] = useState<string[]>(() => readList("docker-field-guide-completed", []));
  const [checkedGate, setCheckedGate] = useState<string[]>(() => readList("docker-field-guide-release-gate", []));
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [downloadMessage, setDownloadMessage] = useState("");

  const activeLesson = lessons.find((lesson) => lesson.id === activeId) ?? lessons[0];
  const visibleLessons = useMemo(() => {
    const query = search.trim().toLowerCase();
    return lessons.filter((lesson) => {
      const matchesTrack = activeTrack === "All modules" || lesson.track === activeTrack;
      const matchesSearch = !query || `${lesson.title} ${lesson.track} ${lesson.summary}`.toLowerCase().includes(query);
      return matchesTrack && matchesSearch;
    });
  }, [activeTrack, search]);

  const progress = Math.round((completed.length / lessons.length) * 100);

  useEffect(() => {
    localStorage.setItem("docker-field-guide-completed", JSON.stringify(completed));
  }, [completed]);

  useEffect(() => {
    localStorage.setItem("docker-field-guide-release-gate", JSON.stringify(checkedGate));
  }, [checkedGate]);

  useEffect(() => {
    if (visibleLessons.length && !visibleLessons.some((lesson) => lesson.id === activeId)) {
      setActiveId(visibleLessons[0].id);
    }
  }, [activeId, visibleLessons]);

  const openLesson = (id: string) => {
    setActiveId(id);
    setAnswers((current) => {
      if (current[id] === undefined) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const startCurriculum = () => {
    setActiveTrack("All modules");
    setSearch("");
    setActiveId("architecture");
    document.getElementById("curriculum")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleDownload = (kind: PdfKind) => {
    buildStudyPdf(kind);
    setPdfMenuOpen(false);
    setDownloadMessage(kind === "guide" ? "Field guide PDF downloaded." : "Five-day sprint PDF downloaded.");
    window.setTimeout(() => setDownloadMessage(""), 4000);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeLesson.command);
      setCopied(true);
      setCopyMessage("Commands copied.");
      window.setTimeout(() => {
        setCopied(false);
        setCopyMessage("");
      }, 2200);
    } catch {
      setCopyMessage("Clipboard access is unavailable in this browser.");
      window.setTimeout(() => setCopyMessage(""), 3000);
    }
  };

  const toggleCompleted = (id: string) => {
    setCompleted((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleGate = (item: string) => {
    setCheckedGate((current) => current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item]);
  };

  const focusDay = (id: string) => {
    setActiveTrack("All modules");
    setSearch("");
    setActiveId(id);
    document.getElementById("curriculum")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <section className="hero" id="top">
        <div className="hero-grid" aria-hidden="true" />
        <header className="site-header">
          <a className="brand-lockup" href="#top" aria-label="Docker Field Guide home">
            <DockerMark />
            <span className="brand-text">
              <strong>DOCKER</strong>
              <small>FIELD GUIDE</small>
            </span>
          </a>
          <nav className="header-nav" aria-label="Main navigation">
            <a href="#curriculum">Curriculum</a>
            <a href="#sprint">5-day sprint</a>
            <a href="#release-gate">Release gate</a>
          </nav>
          <div className="pdf-control">
            <button className="pdf-trigger" type="button" aria-expanded={pdfMenuOpen} onClick={() => setPdfMenuOpen((open) => !open)}>
              <Download size={15} strokeWidth={1.8} />
              <span>Study PDFs</span>
              <ChevronDown size={14} className={pdfMenuOpen ? "chevron-open" : ""} />
            </button>
            <AnimatePresence>
              {pdfMenuOpen && (
                <motion.div className="pdf-menu" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.16 }}>
                  <div className="pdf-menu-heading">Take the course offline</div>
                  <button type="button" onClick={() => handleDownload("guide")}>
                    <span className="pdf-menu-icon"><FileText size={17} /></span>
                    <span><strong>Senior engineer field guide</strong><small>Full syllabus, labs, commands and release gate</small></span>
                    <ArrowDownRight size={16} />
                  </button>
                  <button type="button" onClick={() => handleDownload("sprint")}>
                    <span className="pdf-menu-icon"><Timer size={17} /></span>
                    <span><strong>Five-day rapid sprint</strong><small>Daily focus, practical missions and capstone</small></span>
                    <ArrowDownRight size={16} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        <main className="hero-main">
          <motion.div className="hero-copy" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}>
            <div className="hero-kicker"><span className="status-dot" /> A SENIOR ENGINEER'S WORKING GUIDE</div>
            <h1><span className="hero-brand">Docker</span><span className="hero-title">in production.</span></h1>
            <p className="hero-description">Build a real mental model of the runtime, then learn to ship, secure and operate containers with confidence.</p>
            <div className="hero-actions">
              <button className="button-primary" type="button" onClick={startCurriculum}>
                Start learning <ArrowRight size={17} />
              </button>
              <button className="button-text" type="button" onClick={() => handleDownload("guide")}>
                <FileText size={16} /> Get the field guide PDF
              </button>
            </div>
            <div className="hero-meta"><span><BookOpen size={14} /> 16 practical lessons</span><i /> <span><Timer size={14} /> 10 focused hours</span></div>
          </motion.div>
          <motion.div className="hero-visual" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
            <ArchitectureDiagram />
          </motion.div>
          <div className="hero-index"><span>01</span><span>THE CONTAINER MODEL</span><span className="hero-index-line" /></div>
        </main>
        <a className="scroll-cue" href="#method"><span>SCROLL TO THE FIELD GUIDE</span><ArrowDownRight size={15} /></a>
      </section>

      <section className="method-section" id="method">
        <div className="section-kicker"><span>THE METHOD / 01</span><span>FOUNDATION TO PRODUCTION</span></div>
        <div className="method-intro">
          <h2>Learn the system.<br />Then make it <em>operable.</em></h2>
          <p>Docker is more than a command line. This track connects the Linux primitives to the build pipeline, runtime controls and recovery decisions you will own in production.</p>
        </div>
        <div className="method-rail">
          <div className="method-rail-label"><span>THE ROUTE</span><span>5 DAYS / ABOUT 2 HOURS A DAY</span></div>
          {sprintDays.map((day, index) => (
            <button key={day.day} type="button" className="method-step" onClick={() => focusDay(day.ids[0])}>
              <span className="method-step-index">{day.day}</span>
              <span className="method-step-title">{day.title}</span>
              <span className="method-step-focus">{day.focus}</span>
              <span className="method-step-arrow"><ArrowRight size={15} /></span>
              {index < sprintDays.length - 1 && <span className="method-step-rule" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </section>

      <section className="curriculum-section" id="curriculum">
        <div className="section-kicker"><span>THE CURRICULUM / 02</span><span>16 LESSONS / 3 ENGINEERING TRACKS</span></div>
        <div className="curriculum-heading">
          <div>
            <h2>Understand every layer.</h2>
            <p>Short explanations, useful commands and a checkpoint in every lesson.</p>
          </div>
          <div className="overall-progress" aria-label={`${progress}% of lessons complete`}>
            <div className="progress-label"><span>YOUR PROGRESS</span><strong>{completed.length}<small> / {lessons.length}</small></strong></div>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          </div>
        </div>

        <div className="curriculum-layout">
          <aside className="lesson-nav" aria-label="Course lessons">
            <div className="lesson-nav-top">
              <span className="lesson-count">{visibleLessons.length.toString().padStart(2, "0")} LESSONS</span>
              <span className="lesson-track-label">SELECT A TOPIC</span>
            </div>
            <label className="lesson-search">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search concepts" aria-label="Search lessons" />
              {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={14} /></button>}
            </label>
            <div className="track-filter" role="group" aria-label="Filter lessons by track">
              {tracks.map((track) => (
                <button key={track} type="button" className={activeTrack === track ? "active" : ""} onClick={() => setActiveTrack(track)}>
                  <span>{track}</span>
                  {track !== "All modules" && <small>{lessons.filter((lesson) => lesson.track === track).length}</small>}
                  {track === "All modules" && <small>{lessons.length}</small>}
                </button>
              ))}
            </div>
            <div className="lesson-list">
              {visibleLessons.map((lesson) => {
                const lessonIndex = lessons.findIndex((item) => item.id === lesson.id) + 1;
                const isActive = activeId === lesson.id;
                const isComplete = completed.includes(lesson.id);
                return (
                  <button key={lesson.id} type="button" className={`lesson-link ${isActive ? "selected" : ""}`} onClick={() => openLesson(lesson.id)} aria-current={isActive ? "page" : undefined}>
                    <span className="lesson-link-number">{isComplete ? <Check size={14} /> : String(lessonIndex).padStart(2, "0")}</span>
                    <span className="lesson-link-copy"><strong>{lesson.title}</strong><small>{lesson.track}</small></span>
                    <span className="lesson-link-time">{lesson.time}</span>
                  </button>
                );
              })}
              {!visibleLessons.length && <div className="empty-search">No lessons match that search.<button type="button" onClick={() => { setSearch(""); setActiveTrack("All modules"); }}>Reset filters</button></div>}
            </div>
            <div className="sidebar-note"><Layers3 size={16} /><span>Learn the boundary.<br /><strong>Then test the failure.</strong></span></div>
          </aside>

          <article className="lesson-reader" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div key={activeLesson.id} className="lesson-reader-inner" initial={{ opacity: 0, y: 11 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
                <div className="lesson-article-top">
                  <div className="lesson-breadcrumb"><span>DOCKER FIELD GUIDE</span><span>/</span><span>{activeLesson.track.toUpperCase()}</span></div>
                  <span className="read-time"><Timer size={14} /> {activeLesson.time} READ</span>
                </div>
                <div className="lesson-title-row">
                  <div>
                    <div className="lesson-number-label">LESSON {String(lessons.findIndex((item) => item.id === activeLesson.id) + 1).padStart(2, "0")} / 16</div>
                    <h3>{activeLesson.title}</h3>
                  </div>
                  <button type="button" className={`complete-button ${completed.includes(activeLesson.id) ? "is-complete" : ""}`} onClick={() => toggleCompleted(activeLesson.id)}>
                    {completed.includes(activeLesson.id) ? <CheckCircle2 size={16} /> : <Check size={16} />}
                    {completed.includes(activeLesson.id) ? "Completed" : "Mark complete"}
                  </button>
                </div>
                <p className="lesson-summary">{activeLesson.summary}</p>

                <div className="lesson-insights">
                  <div className="lesson-insight">
                    <div className="insight-heading"><ShieldCheck size={16} /><span>THE SENIOR LENS</span></div>
                    <p>{activeLesson.lens}</p>
                  </div>
                  <div className="lesson-insight practice-insight">
                    <div className="insight-heading"><Play size={15} /><span>PUT IT TO WORK</span></div>
                    <p>{activeLesson.practice}</p>
                  </div>
                </div>

                <div className="command-lab">
                  <div className="command-toolbar">
                    <div><Terminal size={15} /><span>TRY IT IN A TERMINAL</span></div>
                    <button type="button" onClick={handleCopy} aria-label="Copy lesson commands"><span>{copied ? "COPIED" : "COPY"}</span>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
                  </div>
                  <pre><code>{activeLesson.command}</code></pre>
                </div>
                <div className="copy-announcement" aria-live="polite">{copyMessage}</div>

                <div className="knowledge-check">
                  <div className="question-heading"><div className="question-icon"><CircleHelp size={17} /></div><div><span>KNOWLEDGE CHECK</span><h4>{activeLesson.question.prompt}</h4></div></div>
                  <div className="answer-list">
                    {activeLesson.question.options.map((option, index) => {
                      const chosen = answers[activeLesson.id];
                      const hasAnswered = chosen !== undefined;
                      const isCorrect = index === activeLesson.question.answer;
                      return (
                        <button
                          key={option}
                          type="button"
                          className={`answer-option ${hasAnswered && isCorrect ? "answer-correct" : ""} ${hasAnswered && chosen === index && !isCorrect ? "answer-wrong" : ""}`}
                          onClick={() => setAnswers((current) => ({ ...current, [activeLesson.id]: index }))}
                        >
                          <span className="answer-letter">{String.fromCharCode(65 + index)}</span>
                          <span>{option}</span>
                          {hasAnswered && isCorrect && <Check size={15} />}
                        </button>
                      );
                    })}
                  </div>
                  <AnimatePresence>
                    {answers[activeLesson.id] !== undefined && (
                      <motion.p className={`answer-explanation ${answers[activeLesson.id] === activeLesson.question.answer ? "right" : "try-again"}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                        <strong>{answers[activeLesson.id] === activeLesson.question.answer ? "Correct." : "Not quite."}</strong> {activeLesson.question.explanation}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </AnimatePresence>
          </article>
        </div>
      </section>

      <section className="sprint-section" id="sprint">
        <div className="section-kicker"><span>ACCELERATED STUDY / 03</span><span>10 HOURS / ONE PORTFOLIO-READY CAPSTONE</span></div>
        <div className="sprint-heading">
          <div><h2>Five days.<br /><em>One complete system.</em></h2></div>
          <p>This is a fast, focused ramp - not a shortcut around engineering judgment. Each day ends with a concrete lab and a failure to diagnose.</p>
        </div>
        <div className="sprint-list">
          {sprintDays.map((day) => (
            <button key={day.day} className="sprint-day" type="button" onClick={() => focusDay(day.ids[0])}>
              <span className="sprint-day-number">{day.day}</span>
              <span className="sprint-day-name"><strong>{day.title}</strong><small>{day.focus}</small></span>
              <span className="sprint-day-mission">{day.mission}</span>
              <span className="sprint-day-time"><Timer size={14} />{day.duration}</span>
              <span className="sprint-day-link"><ArrowRight size={17} /></span>
            </button>
          ))}
        </div>
        <div className="sprint-footer">
          <span><Zap size={16} /> RECOMMENDED PACE: 2 HOURS / DAY</span>
          <button type="button" onClick={() => handleDownload("sprint")}>Download the sprint PDF <Download size={15} /></button>
        </div>
      </section>

      <section className="release-section" id="release-gate">
        <div className="release-copy">
          <div className="section-kicker section-kicker-dark"><span>PRODUCTION CHECK / 04</span><span>YOUR RELEASE GATE</span></div>
          <h2>Before it ships,<br />prove it is <em>operable.</em></h2>
          <p>A senior engineer's review is a set of observable decisions, not a feeling. Use this checklist on the capstone, then bring it to your next service review.</p>
          <div className="gate-progress"><div><span>GATES REVIEWED</span><strong>{checkedGate.length.toString().padStart(2, "0")}<small> / {releaseChecks.length.toString().padStart(2, "0")}</small></strong></div><div className="gate-progress-track"><span style={{ width: `${(checkedGate.length / releaseChecks.length) * 100}%` }} /></div></div>
        </div>
        <div className="release-checklist">
          {releaseChecks.map((item, index) => {
            const isChecked = checkedGate.includes(item);
            return (
              <label key={item} className={`release-check ${isChecked ? "checked" : ""}`}>
                <input type="checkbox" checked={isChecked} onChange={() => toggleGate(item)} />
                <span className="custom-checkbox">{isChecked && <Check size={13} />}</span>
                <span className="release-check-number">{String(index + 1).padStart(2, "0")}</span>
                <span>{item}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="resources-section" id="resources">
        <div className="resource-heading">
          <span className="section-kicker-inline">CONTINUE WITH PRIMARY SOURCES</span>
          <h2>Verify. Practice. Repeat.</h2>
        </div>
        <div className="resource-links">
          <a href="https://docs.docker.com/engine/" target="_blank" rel="noreferrer"><span><strong>Docker Engine</strong><small>Architecture, installation and operations</small></span><ExternalLink size={16} /></a>
          <a href="https://docs.docker.com/reference/dockerfile/" target="_blank" rel="noreferrer"><span><strong>Dockerfile reference</strong><small>Instructions, mounts and build behavior</small></span><ExternalLink size={16} /></a>
          <a href="https://docs.docker.com/build/building/" target="_blank" rel="noreferrer"><span><strong>Build and Buildx</strong><small>BuildKit, cache and attestations</small></span><ExternalLink size={16} /></a>
          <a href="https://docs.docker.com/compose/" target="_blank" rel="noreferrer"><span><strong>Docker Compose</strong><small>Services, networks and volumes</small></span><ExternalLink size={16} /></a>
          <a href="https://docs.docker.com/engine/security/" target="_blank" rel="noreferrer"><span><strong>Engine security</strong><small>Rootless mode and security controls</small></span><ExternalLink size={16} /></a>
        </div>
      </section>

      <footer className="site-footer">
        <a className="brand-lockup footer-brand" href="#top">
          <DockerMark />
          <span className="brand-text"><strong>DOCKER</strong><small>FIELD GUIDE</small></span>
        </a>
        <p>Understand the boundary. Ship the artifact. Own the recovery.</p>
        <button type="button" onClick={() => handleDownload("guide")}><ClipboardCheck size={15} /> Take the field guide offline</button>
        <span className="footer-edition">A PRACTICAL STUDY EDITION</span>
      </footer>

      <AnimatePresence>
        {downloadMessage && (
          <motion.div className="toast-message" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
            <CheckCircle2 size={17} />{downloadMessage}<button type="button" onClick={() => setDownloadMessage("")} aria-label="Dismiss"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}