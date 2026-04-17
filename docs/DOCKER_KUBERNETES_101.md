# Docker and Kubernetes 101

This document explains the deployment concepts around the Docker packaging that now exists in the project, and where Kubernetes would fit later.

## 1. What is Docker?

Docker is a way to package an application and its dependencies into a container.

A container helps answer this problem:

- "It works on my machine"

With Docker, you define:

- the runtime
- the dependencies
- the startup command

so the app can run more consistently across environments.

## 2. What Docker adds to this project

For this project, Docker now makes it easier to run:

- frontend
- Java Spring Boot backend
- Redis
- MongoDB

together in a repeatable way.

The project now includes a Docker Compose stack for that full runtime.

## 3. What is Docker Compose?

Docker Compose lets you define multiple services in one file.

For this project, `docker-compose.yml` now defines:

- `frontend`
- `backend`
- `redis`
- `mongodb`

So a single command can start the whole stack.

## 4. What is Kubernetes?

Kubernetes is a system for running and managing containers at scale.

Docker helps package the app.
Kubernetes helps operate many containers reliably.

It handles ideas like:

- keeping a desired number of replicas running
- replacing failed containers
- exposing services on the network
- rolling updates
- configuration and secrets

## 5. Important Kubernetes words in simple language

### Pod

The smallest unit Kubernetes runs.

You can think of it as:

- one running application unit

### Deployment

Describes how many replicas of a pod should exist and how updates should happen.

### Service

Gives stable network access to a set of pods.

### Ingress

Handles external HTTP or HTTPS traffic and routes it to services.

### ConfigMap and Secret

Ways to inject configuration values and sensitive data.

## 6. How this project would map to Kubernetes later

One practical mapping could be:

- frontend deployment
- Spring Boot backend deployment
- ingress or load balancer in front
- Redis as a managed service or dedicated deployment
- MongoDB as a managed database or separate deployment

Important production concern:

- WebSocket traffic must be supported properly by the ingress/load balancer
- sticky sessions may still be important depending on the setup

## 7. Why Docker comes before Kubernetes in this project

Because Docker answers:

- how do we package and run this app consistently?

Kubernetes answers:

- how do we run many packaged instances reliably?

So the natural order is:

1. Docker
2. Docker Compose
3. Kubernetes

## 8. How to talk about this in an interview

You can say:

> I first built the real-time collaboration engine and scaled it across backend instances with Redis. After that, I packaged the full stack with Docker Compose so frontend, backend, MongoDB, and Redis can run together consistently. The next step after that would be orchestration and deployment automation, which is where Kubernetes becomes relevant.

That is a clear and honest answer.

## 9. What is already relevant even before Docker and Kubernetes?

Some production ideas already exist in the project:

- env-based configuration
- Spring Boot health/readiness endpoints
- explicit runtime logging
- separation between transport, scaling, and persistence concerns
- Dockerized full-stack packaging with health checks

That means the project has already crossed from local-script development into containerized packaging, even though it is not yet a full Kubernetes-managed platform.
