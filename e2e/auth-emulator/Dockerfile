# Firebase Auth emulator for the end-to-end suite (the auth emulator needs no Java).
FROM node:26.13-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
RUN npm install -g firebase-tools@15.35.0
WORKDIR /emulator
COPY firebase.json .
EXPOSE 9099
CMD ["firebase", "emulators:start", "--only", "auth", "--project", "demo-penny-pincher"]
