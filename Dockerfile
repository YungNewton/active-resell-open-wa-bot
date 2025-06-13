# Use lightweight Node image
FROM node:18-slim

# Set working directory
WORKDIR /app

# Install system dependencies required by Chrome
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    gnupg2 \
    unzip \
    libglib2.0-0 \
    libnss3 \
    libfontconfig1 \
    libxss1 \
    libappindicator3-1 \
    libgbm1 \
    libasound2 \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    xdg-utils \
    libvulkan1 \
    libvulkan-dev \
    ca-certificates \
    dbus-x11 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Chrome
RUN curl -LO https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_131.0.6778.108-1_amd64.deb && \
    apt-get install -y ./google-chrome-stable_131.0.6778.108-1_amd64.deb && \
    rm google-chrome-stable_131.0.6778.108-1_amd64.deb

# Copy dependencies and install all (including dev if needed)
COPY package*.json ./
RUN npm install

# Copy source files (not dist!)
COPY . .

# Build the app (compiles TypeScript to dist/)
RUN npm run build

# Expose backend port
EXPOSE 8080

# Start backend from compiled output
CMD ["node", "dist/server.js"]
