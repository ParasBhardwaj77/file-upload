import * as faceapi from '@vladmandic/face-api';
import Tesseract from 'tesseract.js';

export class FaceDetectionService {
  constructor() {
    this.faceDescriptor = null;
    this.isProcessing = false;
  }

  // Detect faces in an image using multiple models
  async detectFaces(imageElement, options = {}) {
    const {
      useTinyDetector = true,
      minConfidence = 0.5,
      withLandmarks = true,
      withDescriptor = true,
      withAgeGender = true,
      withExpressions = true
    } = options;

    try {
      const detections = await faceapi
        .detectAllFaces(
          imageElement,
          useTinyDetector 
            ? new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: minConfidence })
            : new faceapi.SsdMobilenetv1Options({ minConfidence })
        )
        .withFaceLandmarks()
        .withFaceDescriptor()
        .withAgeAndGender()
        .withFaceExpressions();

      return detections.map(detection => ({
        id: Math.random().toString(36).substr(2, 9),
        boundingBox: detection.detection.box,
        landmarks: detection.landmarks,
        descriptor: detection.descriptor,
        age: Math.round(detection.age),
        gender: detection.gender,
        genderProbability: detection.genderProbability,
        expressions: detection.expressions,
        expression: this.getDominantExpression(detection.expressions),
        confidence: detection.detection.score,
        quality: this.calculateFaceQuality(detection)
      }));
    } catch (error) {
      console.error('Error detecting faces:', error);
      throw new Error('Face detection failed');
    }
  }

  // Get the dominant expression from expressions object
  getDominantExpression(expressions) {
    return Object.entries(expressions).reduce((max, [expression, value]) => 
      value > max.value ? { expression, value } : max, 
      { expression: '', value: 0 }
    );
  }

  // Calculate face quality score based on multiple factors
  calculateFaceQuality(detection) {
    const { box, landmarks, detection: { score } } = detection;
    
    // Base score from detection confidence
    let quality = score * 100;
    
    // Size factor (larger faces are generally better quality)
    const faceSize = box.width * box.height;
    const sizeScore = Math.min(faceSize / 10000, 1) * 20;
    quality += sizeScore;
    
    // Landmarks completeness (more landmarks = better quality)
    const landmarksScore = (landmarks.positions.length / 68) * 15;
    quality += landmarksScore;
    
    // Face aspect ratio (roughly square is better)
    const aspectRatio = box.width / box.height;
    const aspectScore = (aspectRatio > 0.7 && aspectRatio < 1.3) ? 10 : 5;
    quality += aspectScore;
    
    return Math.min(quality, 100);
  }

  // Extract face from image with proper margins
  async extractFace(imageElement, faceDetection) {
    try {
      const { box } = faceDetection;
      const marginX = box.width * 0.3;
      const marginY = box.height * 0.4;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const sx = Math.max(0, box.x - marginX);
      const sy = Math.max(0, box.y - marginY);
      const sWidth = box.width + marginX * 2;
      const sHeight = box.height + marginY * 2;

      canvas.width = sWidth;
      canvas.height = sHeight;
      ctx.drawImage(
        imageElement,
        sx, sy, sWidth, sHeight,
        0, 0, sWidth, sHeight
      );

      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Error extracting face:', error);
      throw new Error('Face extraction failed');
    }
  }

  // Calculate face similarity between two face descriptors
  calculateFaceSimilarity(descriptor1, descriptor2) {
    if (!descriptor1 || !descriptor2) return 0;
    
    const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
    return Math.max(0, 100 - distance * 100);
  }

  // Process webcam frame for real-time analysis
  async processWebcamFrame(videoElement, options = {}) {
    try {
      const detection = await faceapi
        .detectSingleFace(
          videoElement,
          new faceapi.TinyFaceDetectorOptions({ 
            inputSize: 416, 
            scoreThreshold: 0.5 
          })
        )
        .withFaceLandmarks()
        .withFaceDescriptor()
        .withAgeAndGender()
        .withFaceExpressions();

      if (!detection) return null;

      return {
        boundingBox: detection.detection.box,
        landmarks: detection.landmarks,
        descriptor: detection.descriptor,
        age: Math.round(detection.age),
        gender: detection.gender,
        genderProbability: detection.genderProbability,
        expressions: detection.expressions,
        expression: this.getDominantExpression(detection.expressions),
        confidence: detection.detection.score,
        quality: this.calculateFaceQuality(detection)
      };
    } catch (error) {
      console.error('Error processing webcam frame:', error);
      return null;
    }
  }

  // Store face descriptor for comparison
  storeFaceDescriptor(descriptor) {
    this.faceDescriptor = descriptor;
  }

  // Compare current face with stored descriptor
  compareWithStoredFace(currentDescriptor) {
    if (!this.faceDescriptor || !currentDescriptor) return null;
    
    const similarity = this.calculateFaceSimilarity(this.faceDescriptor, currentDescriptor);
    return {
      similarity: similarity.toFixed(2),
      match: similarity > 70, // 70% threshold for match
      confidence: similarity
    };
  }
}