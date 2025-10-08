import React, { useState, useEffect, createContext, useContext } from 'react';
import * as faceapi from '@vladmandic/face-api';
import Tesseract from 'tesseract.js';
import Webcam from 'react-webcam';

// Create context for global state
const FaceDetectionContext = createContext();

// Core state management
export const FaceDetectionProvider = ({ children }) => {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [videoData, setVideoData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load all face detection models
  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = "/models";
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
        console.log("✅ All face detection models loaded successfully");
      } catch (err) {
        console.error("❌ Error loading models:", err);
        setError("Failed to load face detection models. Please refresh the page.");
      }
    };
    loadModels();
  }, []);

  // Global state methods
  const startProcessing = () => {
    setIsProcessing(true);
    setError(null);
  };

  const stopProcessing = () => {
    setIsProcessing(false);
  };

  const setUploadedImageHandler = (image) => {
    setUploadedImage(image);
    setProcessedData(null);
    setVideoData(null);
  };

  const setErrorHandler = (errorMessage) => {
    setError(errorMessage);
    setIsProcessing(false);
  };

  const clearError = () => {
    setError(null);
  };

  return (
    <FaceDetectionContext.Provider value={{
      modelsLoaded,
      loading,
      error,
      uploadedImage,
      processedData,
      videoData,
      isProcessing,
      startProcessing,
      stopProcessing,
      setUploadedImage: setUploadedImageHandler,
      setError: setErrorHandler,
      clearError,
      setProcessedData,
      setVideoData
    }}>
      {children}
    </FaceDetectionContext.Provider>
  );
};

// Hook to use the face detection context
export const useFaceDetection = () => {
  const context = useContext(FaceDetectionContext);
  if (!context) {
    throw new Error('useFaceDetection must be used within a FaceDetectionProvider');
  }
  return context;
};