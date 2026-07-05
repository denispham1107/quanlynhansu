// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAlHZbudVUTQXScsV9filijd8aGGmnzvT0",
  authDomain: "quanlynhansu-6e63b.firebaseapp.com",
  projectId: "quanlynhansu-6e63b",
  storageBucket: "quanlynhansu-6e63b.firebasestorage.app",
  messagingSenderId: "397661730137",
  appId: "1:397661730137:web:a25523d25d81fd3f4cc848",
  measurementId: "G-NYBQE7WT2N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
