# Firebase Auth emulator for the end-to-end suite (the auth emulator needs no Java).
FROM node:24-alpine
RUN npm install -g firebase-tools@15.35.0
WORKDIR /emulator
COPY firebase.json .
EXPOSE 9099
CMD ["firebase", "emulators:start", "--only", "auth", "--project", "demo-penny-pincher"]
