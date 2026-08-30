/*
 * Reference Gradle build for the Pokémon Assistant Cobblemon bridge mod.
 *
 * Adjust the version coordinates below to match your modpack's Cobblemon /
 * Minecraft / Fabric Loader / Yarn mappings. The versions here track
 * Cobblemon 1.6.x / Minecraft 1.20.1, which were current at the time the
 * scaffold was authored.
 */

plugins {
    kotlin("jvm") version "1.9.22"
    id("fabric-loom") version "1.6-SNAPSHOT"
}

group = "com.pokemonassistant"
version = "0.1.0"

repositories {
    mavenCentral()
    maven("https://maven.fabricmc.net/")
    maven("https://maven.impactdev.net/repository/development/")
}

dependencies {
    minecraft("com.mojang:minecraft:1.20.1")
    mappings("net.fabricmc:yarn:1.20.1+build.10:v2")
    modImplementation("net.fabricmc:fabric-loader:0.15.7")
    modImplementation("net.fabricmc.fabric-api:fabric-api:0.92.0+1.20.1")
    modImplementation("net.fabricmc:fabric-language-kotlin:1.10.18+kotlin.1.9.22")

    // Cobblemon - substitute the artifact matching your target release.
    modImplementation("com.cobblemon:Cobblemon:1.6.0+1.20.1-SNAPSHOT")

    implementation("com.fasterxml.jackson.core:jackson-databind:2.16.1")
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
    kotlinOptions {
        jvmTarget = "17"
    }
}
