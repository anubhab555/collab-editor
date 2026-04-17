FROM gradle:8.13-jdk21-alpine AS build

WORKDIR /workspace

COPY backend/settings.gradle backend/build.gradle backend/gradlew backend/gradlew.bat ./
COPY backend/gradle ./gradle
RUN chmod +x ./gradlew && ./gradlew dependencies --no-daemon

COPY backend/src ./src
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

COPY --from=build /workspace/build/libs/*.jar app.jar

ENV JAVA_OPTS=""
ENV SOCKET_PORT=3001

EXPOSE 3001

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
