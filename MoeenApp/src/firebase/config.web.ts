import { initializeApp } from "firebase/app";
import { browserLocalPersistence, initializeAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBldMPWTQd3ON98A3BxZDojRqcI1qq4dug",
  authDomain: "moeen-512ea.firebaseapp.com",
  projectId: "moeen-512ea",
  storageBucket: "moeen-512ea.firebasestorage.app",
  messagingSenderId: "1061130562736",
  appId: "1:1061130562736:web:befb7b6e017536062a9f75",
};

export const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
});
