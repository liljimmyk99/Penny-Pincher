# Firebase Auth emulator for the end-to-end suite (the auth emulator needs no Java).
FROM node:26.12-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797
RUN npm install -g firebase-tools@15.35.0
WORKDIR /emulator
COPY firebase.json .
EXPOSE 9099
CMD ["firebase", "emulators:start", "--only", "auth", "--project", "demo-penny-pincher"]
