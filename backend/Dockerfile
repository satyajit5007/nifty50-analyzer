# ─── Stage 1: Build with Maven ────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21-alpine AS build

WORKDIR /app

# Render builds from REPO ROOT as context, so prefix paths with backend/
# Copy pom.xml first for dependency caching layer
COPY backend/pom.xml .
RUN mvn dependency:go-offline -B

# Copy source code and build the JAR
COPY backend/src ./src
RUN mvn clean package -DskipTests -B

# ─── Stage 2: Minimal JRE runtime image ───────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Copy only the built JAR from Stage 1
COPY --from=build /app/target/nifty50-analyzer-1.0.0.jar app.jar

# Render injects $PORT automatically → Spring Boot reads via ${PORT:8080}
EXPOSE 8080

ENTRYPOINT ["java", \
  "-Dspring.profiles.active=prod", \
  "-Xmx400m", \
  "-Xms128m", \
  "-jar", "app.jar"]
