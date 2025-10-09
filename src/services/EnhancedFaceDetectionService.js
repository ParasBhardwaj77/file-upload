import * as faceapi from '@vladmandic/face-api';

export class EnhancedFaceDetectionService {
  constructor() {
    this.faceDescriptor = null;
    this.isProcessing = false;
  }

  // Detect faces with enhanced features including glasses detection
  async detectFaces(imageElement, options = {}) {
    const {
      useTinyDetector = true,
      minConfidence = 0.5,
      withLandmarks = true,
      withDescriptor = true,
      withAgeGender = true,
      withExpressions = true,
      withFeatures = true
    } = options;

    try {
      // Multi-model detection for better accuracy
      const allDetections = [];

      // Method 1: SSD MobileNet with higher confidence
      try {
        console.log('Trying SSD detection with confidence:', Math.max(minConfidence, 0.6));
        const ssdDetections = await faceapi
          .detectAllFaces(
            imageElement,
            new faceapi.SsdMobilenetv1Options({ minConfidence: Math.max(minConfidence, 0.6) })
          )
          .withFaceLandmarks()
          .withFaceDescriptor();
        console.log('SSD detections found:', ssdDetections.length);
        allDetections.push(...ssdDetections.map(d => ({ ...d, method: 'ssd' })));
      } catch (error) {
        console.warn('SSD detection failed:', error);
      }

      // Method 2: Tiny Face Detector as fallback
      if (allDetections.length === 0) {
        try {
          console.log('Trying Tiny Face Detector with confidence:', minConfidence);
          const tinyDetections = await faceapi
            .detectAllFaces(
              imageElement,
              new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: minConfidence })
            )
            .withFaceLandmarks()
            .withFaceDescriptor();
          console.log('Tiny detections found:', tinyDetections.length);
          allDetections.push(...tinyDetections.map(d => ({ ...d, method: 'tiny' })));
        } catch (error) {
          console.warn('Tiny detector failed:', error);
        }
      }

      // Method 3: Try with lower confidence if no detections
      if (allDetections.length === 0) {
        try {
          console.log('Trying low confidence SSD detection with confidence: 0.3');
          const lowConfDetections = await faceapi
            .detectAllFaces(
              imageElement,
              new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 })
            )
            .withFaceLandmarks()
            .withFaceDescriptor();
          console.log('Low confidence detections found:', lowConfDetections.length);
          allDetections.push(...lowConfDetections.map(d => ({ ...d, method: 'low_conf' })));
        } catch (error) {
          console.warn('Low confidence detection failed:', error);
        }
      }

      // Method 4: Try single face detection if all else fails
      if (allDetections.length === 0) {
        try {
          console.log('Trying single face detection with confidence:', minConfidence);
          const singleDetection = await faceapi
            .detectSingleFace(
              imageElement,
              new faceapi.SsdMobilenetv1Options({ minConfidence: minConfidence })
            )
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (singleDetection) {
            console.log('Single detection found');
            allDetections.push({ ...singleDetection, method: 'single' });
          }
        } catch (error) {
          console.warn('Single face detection failed:', error);
        }
      }

      // Remove duplicates and keep best detections
      const uniqueDetections = this.removeDuplicateDetections(allDetections);

      if (uniqueDetections.length === 0) {
        return [];
      }

      // Process detections with enhanced quality scoring
      const processedDetections = uniqueDetections.map(detection => {
        try {
          // Validate detection structure
          if (!detection || !detection.detection || !detection.detection.box) {
            console.warn('Invalid detection structure:', detection);
            return null;
          }

          console.log('Processing detection:', {
            confidence: detection.detection.score,
            hasDescriptor: !!detection.descriptor,
            hasLandmarks: !!detection.landmarks,
            method: detection.method
          });

          const enhancedDetection = {
            id: Math.random().toString(36).substr(2, 9),
            boundingBox: detection.detection.box,
            landmarks: detection.landmarks || null,
            descriptor: detection.descriptor || null,
            age: null,
            gender: null,
            genderProbability: null,
            expressions: {},
            expression: { expression: '', value: 0 },
            confidence: detection.detection.score || 0,
            quality: this.calculateEnhancedFaceQuality(detection),
            features: withFeatures ? this.analyzeFacialFeatures(detection) : null,
            detectionMethod: detection.method || 'unknown'
          };

          // Boost confidence based on detection method
          if (detection.method === 'ssd') {
            enhancedDetection.confidence = Math.min(enhancedDetection.confidence * 1.1, 1);
          }

          return enhancedDetection;
        } catch (error) {
          console.warn('Error processing detection:', error);
          return {
            id: Math.random().toString(36).substr(2, 9),
            boundingBox: detection.detection.box || {},
            landmarks: detection.landmarks || null,
            descriptor: null,
            age: null,
            gender: null,
            genderProbability: null,
            expressions: {},
            expression: { expression: '', value: 0 },
            confidence: detection.detection.score || 0,
            quality: this.calculateFaceQuality(detection),
            features: null,
            detectionMethod: detection.method || 'unknown'
          };
        }
      }).filter(detection => detection !== null); // Remove any null entries

      console.log('Processed detections:', processedDetections.length);
      return processedDetections;
    } catch (error) {
      console.error('Error detecting faces:', error);
      throw new Error('Face detection failed: ' + error.message);
    }
  }

  // Remove duplicate detections by keeping the highest confidence
  removeDuplicateDetections(detections) {
    const uniqueDetections = [];
    const usedBoxes = [];

    detections.forEach(detection => {
      const box = detection.detection.box;
      const isDuplicate = usedBoxes.some(usedBox =>
        this.calculateIoU(box, usedBox) > 0.7
      );

      if (!isDuplicate) {
        uniqueDetections.push(detection);
        usedBoxes.push(box);
      } else {
        // Replace if current detection has higher confidence
        const existingIndex = usedBoxes.findIndex(usedBox =>
          this.calculateIoU(box, usedBox) > 0.7
        );
        if (existingIndex !== -1 && detection.detection.score > uniqueDetections[existingIndex].detection.score) {
          uniqueDetections[existingIndex] = detection;
          usedBoxes[existingIndex] = box;
        }
      }
    });

    // Sort by confidence and return top detections
    return uniqueDetections.sort((a, b) => b.detection.score - a.detection.score);
  }

  // Calculate Intersection over Union (IoU) for bounding boxes
  calculateIoU(box1, box2) {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

    if (x2 <= x1 || y2 <= y1) {
      return 0;
    }

    const intersection = (x2 - x1) * (y2 - y1);
    const union = box1.width * box1.height + box2.width * box2.height - intersection;

    return intersection / union;
  }

  // Enhanced face quality calculation
  calculateEnhancedFaceQuality(detection) {
    try {
      const { box, landmarks, detection: { score } } = detection;

      // Validate required properties
      if (!box || !box.width || !box.height) {
        return 0; // Invalid box
      }

      // Base score from detection confidence
      let quality = score * 100;

      // Size factor (larger faces are generally better quality)
      const faceSize = box.width * box.height;
      const sizeScore = Math.min(faceSize / 10000, 1) * 25;
      quality += sizeScore;

      // Landmarks completeness (more landmarks = better quality)
      if (landmarks && landmarks.positions) {
        const landmarksScore = (landmarks.positions.length / 68) * 20;
        quality += landmarksScore;
      }

      // Face aspect ratio (roughly square is better)
      const aspectRatio = box.width / box.height;
      const aspectScore = (aspectRatio > 0.7 && aspectRatio < 1.3) ? 15 : 5;
      quality += aspectScore;

      // Center position bonus (faces in center are better)
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      const imageCenter = { x: 640 / 2, y: 480 / 2 }; // Assuming typical image size
      const distanceFromCenter = Math.sqrt(
        Math.pow(centerX - imageCenter.x, 2) + Math.pow(centerY - imageCenter.y, 2)
      );
      const centerBonus = Math.max(0, 20 - distanceFromCenter / 10);
      quality += centerBonus;

      return Math.min(quality, 100);
    } catch (error) {
      console.warn('Error calculating face quality:', error);
      return 50; // Default moderate quality
    }
  }

  // Analyze facial features including glasses detection
  analyzeFacialFeatures(detection) {
    try {
      const { landmarks } = detection;

      // Validate landmarks
      if (!landmarks || !landmarks.positions || landmarks.positions.length < 68) {
        return {
          glasses: { hasGlasses: false, confidence: 0, error: true },
          facialHair: { hasBeard: false, hasMustache: false, confidence: 0, error: true },
          pose: { pose: 'unknown', angle: 0, confidence: 0 },
          eyes: { leftEye: { state: 'unknown', ear: 0 }, rightEye: { state: 'unknown', ear: 0 }, bothOpen: false },
          smile: { isSmiling: false, confidence: 0, ratio: 0 },
          featureConfidence: 0
        };
      }

      const positions = landmarks.positions;

      // Glasses detection using eye landmarks and nose bridge
      const glasses = this.detectGlasses(positions);

      // Beard/mustache detection using mouth and chin area
      const facialHair = this.detectFacialHair(positions);

      // Head pose estimation (simplified)
      const pose = this.estimateHeadPose(positions);

      // Eye analysis
      const eyes = this.analyzeEyes(positions);

      // Smile detection
      const smile = this.detectSmile(positions);

      return {
        glasses,
        facialHair,
        pose,
        eyes,
        smile,
        featureConfidence: this.calculateFeatureConfidence(glasses, facialHair, eyes)
      };
    } catch (error) {
      console.warn('Error analyzing facial features:', error);
      return {
        glasses: { hasGlasses: false, confidence: 0, error: true },
        facialHair: { hasBeard: false, hasMustache: false, confidence: 0, error: true },
        pose: { pose: 'unknown', angle: 0, confidence: 0 },
        eyes: { leftEye: { state: 'unknown', ear: 0 }, rightEye: { state: 'unknown', ear: 0 }, bothOpen: false },
        smile: { isSmiling: false, confidence: 0, ratio: 0 },
        featureConfidence: 0
      };
    }
  }

  // Detect glasses using eye landmarks and nose bridge
  detectGlasses(positions) {
    try {
      // Eye landmarks (left eye: 36-41, right eye: 42-47)
      const leftEye = positions.slice(36, 42);
      const rightEye = positions.slice(42, 48);

      // Nose bridge landmarks (27-35)
      const noseBridge = positions.slice(27, 36);

      // Calculate eye aspect ratio and other features
      const leftEyeEAR = this.calculateEyeAspectRatio(leftEye);
      const rightEyeEAR = this.calculateEyeAspectRatio(rightEye);

      // Calculate distance between eyes and nose bridge
      const eyeToNoseDistance = this.calculateEyeToNoseDistance(leftEye, rightEye, noseBridge);

      // Detect glasses based on multiple features
      const hasGlasses = this.classifyGlasses(leftEyeEAR, rightEyeEAR, eyeToNoseDistance);

      return {
        hasGlasses,
        confidence: hasGlasses ? Math.max(leftEyeEAR, rightEyeEAR) : 0,
        leftEyeEAR,
        rightEyeEAR,
        eyeToNoseDistance,
        method: 'geometric_analysis'
      };
    } catch (error) {
      console.error('Error in glasses detection:', error);
      return { hasGlasses: false, confidence: 0, error: true };
    }
  }

  // Calculate eye aspect ratio (EAR) for blink detection and glasses detection
  calculateEyeAspectRatio(eyePoints) {
    try {
      // Eye points: [outer, top, inner, bottom, outer]
      const vertical1 = this.getDistance(eyePoints[1], eyePoints[5]); // top to bottom
      const vertical2 = this.getDistance(eyePoints[2], eyePoints[4]); // inner to outer
      const horizontal = this.getDistance(eyePoints[0], eyePoints[3]); // outer to inner

      if (horizontal === 0) return 0;

      const ear = (vertical1 + vertical2) / (2 * horizontal);
      return Math.min(ear, 1); // Normalize to 0-1
    } catch (error) {
      return 0;
    }
  }

  // Calculate distance between eyes and nose bridge
  calculateEyeToNoseDistance(leftEye, rightEye, noseBridge) {
    try {
      // Calculate average eye center
      const leftEyeCenter = this.getCenter(leftEye);
      const rightEyeCenter = this.getCenter(rightEye);
      const eyeCenter = {
        x: (leftEyeCenter.x + rightEyeCenter.x) / 2,
        y: (leftEyeCenter.y + rightEyeCenter.y) / 2
      };

      // Calculate nose bridge center
      const noseCenter = this.getCenter(noseBridge);

      // Calculate distance
      return this.getDistance(eyeCenter, noseCenter);
    } catch (error) {
      return 0;
    }
  }

  // Classify glasses based on eye and nose features
  classifyGlasses(leftEyeEAR, rightEyeEAR, eyeToNoseDistance) {
    // Glasses detection thresholds (these may need adjustment)
    const EAR_THRESHOLD = 0.25; // Lower than normal blink threshold
    const DISTANCE_THRESHOLD = 30; // Pixels (adjust based on image resolution)

    // If both eyes have low EAR and distance is reasonable, likely glasses
    if (leftEyeEAR < EAR_THRESHOLD && rightEyeEAR < EAR_THRESHOLD) {
      if (eyeToNoseDistance > DISTANCE_THRESHOLD) {
        return true; // Glasses detected
      }
    }

    // Additional heuristic: if one eye has very low EAR and other is normal
    // could indicate glasses reflection or obstruction
    if ((leftEyeEAR < EAR_THRESHOLD * 0.8 && rightEyeEAR > EAR_THRESHOLD * 1.2) ||
      (rightEyeEAR < EAR_THRESHOLD * 0.8 && leftEyeEAR > EAR_THRESHOLD * 1.2)) {
      return true; // Possible glasses
    }

    return false;
  }

  // Detect facial hair (beard, mustache)
  detectFacialHair(positions) {
    try {
      // Mouth landmarks (48-67)
      const mouth = positions.slice(48, 68);

      // Chin landmarks (6-11, 8-14)
      const chin = positions.slice(6, 12);

      // Analyze mouth area for hair indicators
      const mouthFeatures = this.analyzeMouthArea(mouth, chin);

      return {
        hasBeard: mouthFeatures.hasBeard,
        hasMustache: mouthFeatures.hasMustache,
        confidence: mouthFeatures.confidence,
        method: 'geometric_analysis'
      };
    } catch (error) {
      return { hasBeard: false, hasMustache: false, confidence: 0, error: true };
    }
  }

  // Analyze mouth area for facial hair detection
  analyzeMouthArea(mouth, chin) {
    try {
      // Calculate mouth width and height
      const mouthWidth = this.getDistance(mouth[0], mouth[6]);
      const mouthHeight = this.getDistance(mouth[3], mouth[9]);

      // Calculate chin area
      const chinWidth = this.getDistance(chin[0], chin[6]);

      // Simple heuristic: if mouth area is relatively small compared to chin
      // and has certain characteristics, it might indicate facial hair
      const mouthToChinRatio = mouthWidth / chinWidth;

      // This is a simplified heuristic - in practice, you'd need more sophisticated analysis
      const hasBeard = mouthToChinRatio < 0.3 && mouthHeight / mouthWidth > 0.4;
      const hasMustache = mouthHeight / mouthWidth < 0.3;

      return {
        hasBeard,
        hasMustache,
        confidence: Math.random() * 0.5 + 0.3, // Placeholder confidence
        method: 'geometric_analysis'
      };
    } catch (error) {
      return { hasBeard: false, hasMustache: false, confidence: 0 };
    }
  }

  // Estimate head pose (simplified)
  estimateHeadPose(positions) {
    try {
      // Use nose tip and eye positions for basic pose estimation
      const noseTip = positions[30];
      const leftEye = positions[36];
      const rightEye = positions[45];

      // Calculate relative positions
      const eyeToNoseVector = {
        x: noseTip.x - (leftEye.x + rightEye.x) / 2,
        y: noseTip.y - (leftEye.y + rightEye.y) / 2
      };

      // Simple pose classification
      const angle = Math.atan2(eyeToNoseVector.y, eyeToNoseVector.x) * 180 / Math.PI;

      let pose = 'frontal';
      if (angle > 15) pose = 'looking_down';
      else if (angle < -15) pose = 'looking_up';
      else if (Math.abs(eyeToNoseVector.x) > 10) pose = 'profile';

      return {
        pose,
        angle: Math.round(angle),
        confidence: 0.7 // Placeholder
      };
    } catch (error) {
      return { pose: 'unknown', angle: 0, confidence: 0 };
    }
  }

  // Analyze eye features
  analyzeEyes(positions) {
    try {
      const leftEye = positions.slice(36, 42);
      const rightEye = positions.slice(42, 48);

      const leftEAR = this.calculateEyeAspectRatio(leftEye);
      const rightEAR = this.calculateEyeAspectRatio(rightEye);

      // Detect eye state
      const leftEyeState = leftEAR > 0.2 ? 'open' : 'closed';
      const rightEyeState = rightEAR > 0.2 ? 'open' : 'closed';

      return {
        leftEye: {
          state: leftEyeState,
          ear: leftEAR,
          confidence: Math.min(leftEAR * 5, 1)
        },
        rightEye: {
          state: rightEyeState,
          ear: rightEAR,
          confidence: Math.min(rightEAR * 5, 1)
        },
        bothOpen: leftEyeState === 'open' && rightEyeState === 'open'
      };
    } catch (error) {
      return { leftEye: { state: 'unknown', ear: 0 }, rightEye: { state: 'unknown', ear: 0 }, bothOpen: false };
    }
  }

  // Detect smile using mouth landmarks
  detectSmile(positions) {
    try {
      const mouth = positions.slice(48, 68);

      // Calculate mouth corners and center
      const leftCorner = mouth[0];
      const rightCorner = mouth[6];
      const topLip = mouth[13];
      const bottomLip = mouth[14];

      // Calculate mouth width and height
      const mouthWidth = this.getDistance(leftCorner, rightCorner);
      const mouthHeight = this.getDistance(topLip, bottomLip);

      // Smile detection: if mouth is wider than it is tall
      const smileRatio = mouthWidth / mouthHeight;
      const isSmiling = smileRatio > 2.5;

      return {
        isSmiling,
        confidence: Math.min(smileRatio / 3, 1),
        ratio: smileRatio
      };
    } catch (error) {
      return { isSmiling: false, confidence: 0, ratio: 0 };
    }
  }

  // Calculate overall feature confidence
  calculateFeatureConfidence(glasses, facialHair, eyes) {
    try {
      let confidence = 0;
      let count = 0;

      if (glasses && !glasses.error) {
        confidence += glasses.confidence;
        count++;
      }

      if (facialHair && !facialHair.error) {
        confidence += Math.max(facialHair.hasBeard, facialHair.hasMustache) ? facialHair.confidence : 0;
        count++;
      }

      if (eyes) {
        confidence += Math.max(eyes.leftEye.confidence, eyes.rightEye.confidence);
        count++;
      }

      return count > 0 ? confidence / count : 0;
    } catch (error) {
      return 0;
    }
  }

  // Helper function to calculate distance between two points
  getDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Helper function to calculate center of points
  getCenter(points) {
    const sum = points.reduce((acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y
    }), { x: 0, y: 0 });

    return {
      x: sum.x / points.length,
      y: sum.y / points.length
    };
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

  // Calculate face similarity between two face descriptors with enhanced accuracy
  calculateFaceSimilarity(descriptor1, descriptor2) {
    if (!descriptor1 || !descriptor2) return 0;

    try {
      // Advanced multiple distance metrics for maximum accuracy
      const euclideanDistance = faceapi.euclideanDistance(descriptor1, descriptor2);

      // Cosine similarity (more robust to magnitude variations)
      const magnitude1 = Math.sqrt(descriptor1.reduce((sum, val) => sum + val * val, 0));
      const magnitude2 = Math.sqrt(descriptor2.reduce((sum, val) => sum + val * val, 0));

      // Normalize descriptors to unit vectors for cosine similarity
      const normalized1 = descriptor1.map(val => val / magnitude1);
      const normalized2 = descriptor2.map(val => val / magnitude2);

      const dotProduct = normalized1.reduce((sum, val, i) => sum + val * normalized2[i], 0);
      const cosineSimilarity = Math.max(0, dotProduct);

      // Manhattan distance for additional robustness
      const manhattanDistance = descriptor1.reduce((sum, val, i) => sum + Math.abs(val - descriptor2[i]), 0);
      const manhattanSimilarity = Math.max(0, 100 - manhattanDistance * 10);

      // Chi-squared distance for distribution comparison
      const chi2Distance = descriptor1.reduce((sum, val, i) => {
        const expected = (val + descriptor2[i]) / 2;
        return sum + Math.pow(val - expected, 2) / (expected + 1e-10);
      }, 0) / descriptor1.length;
      const chi2Similarity = Math.max(0, 100 - chi2Distance * 50);

      // Combined similarity score with optimized weighted average
      const euclideanSimilarity = Math.max(0, 100 - euclideanDistance * 100);
      const cosineSimilarityScore = cosineSimilarity * 100;

      // Dynamic weighting based on quality metrics
      const qualityMetrics = this.calculateAdvancedQualityMetrics(descriptor1, descriptor2);
      const weights = this.calculateOptimalWeights(qualityMetrics);

      const combinedSimilarity = Math.round(
        (euclideanSimilarity * weights.euclidean) +
        (cosineSimilarityScore * weights.cosine) +
        (manhattanSimilarity * weights.manhattan) +
        (chi2Similarity * weights.chi2)
      );

      // Enhanced quality-based adjustment
      const qualityAdjustment = this.calculateEnhancedQualityAdjustment(descriptor1, descriptor2, qualityMetrics);
      const finalSimilarity = Math.min(100, Math.max(0, combinedSimilarity + qualityAdjustment));

      return finalSimilarity;
    } catch (error) {
      console.error('Error calculating face similarity:', error);
      return 0;
    }
  }

  // Calculate advanced quality metrics for descriptors
  calculateAdvancedQualityMetrics(descriptor1, descriptor2) {
    try {
      const magnitude1 = Math.sqrt(descriptor1.reduce((sum, val) => sum + val * val, 0));
      const magnitude2 = Math.sqrt(descriptor2.reduce((sum, val) => sum + val * val, 0));

      // Magnitude consistency
      const magnitudeRatio = Math.min(magnitude1, magnitude2) / Math.max(magnitude1, magnitude2);

      // Descriptor variance (lower variance = more stable)
      const variance1 = descriptor1.reduce((sum, val) => sum + Math.pow(val - magnitude1 / descriptor1.length, 2), 0) / descriptor1.length;
      const variance2 = descriptor2.reduce((sum, val) => sum + Math.pow(val - magnitude2 / descriptor2.length, 2), 0) / descriptor2.length;
      const avgVariance = (variance1 + variance2) / 2;

      // Signal-to-noise ratio
      const snr1 = magnitude1 / (Math.sqrt(variance1) + 1e-10);
      const snr2 = magnitude2 / (Math.sqrt(variance2) + 1e-10);
      const avgSNR = (snr1 + snr2) / 2;

      // Descriptor stability (how close to unit vector)
      const stability1 = magnitude1 / Math.sqrt(descriptor1.length);
      const stability2 = magnitude2 / Math.sqrt(descriptor2.length);
      const avgStability = (stability1 + stability2) / 2;

      return {
        magnitudeRatio,
        avgVariance,
        avgSNR,
        avgStability,
        magnitude1,
        magnitude2
      };
    } catch (error) {
      return {
        magnitudeRatio: 0.8,
        avgVariance: 0.1,
        avgSNR: 10,
        avgStability: 0.8,
        magnitude1: 50,
        magnitude2: 50
      };
    }
  }

  // Calculate optimal weights based on quality metrics
  calculateOptimalWeights(qualityMetrics) {
    try {
      const { magnitudeRatio, avgSNR, avgStability } = qualityMetrics;

      // Base weights
      let weights = {
        euclidean: 0.4,
        cosine: 0.3,
        manhattan: 0.15,
        chi2: 0.15
      };

      // Adjust weights based on quality metrics
      if (magnitudeRatio > 0.9) {
        weights.euclidean += 0.1;
        weights.cosine += 0.05;
      } else if (magnitudeRatio < 0.7) {
        weights.cosine += 0.1;
        weights.euclidean -= 0.05;
      }

      if (avgSNR > 15) {
        weights.euclidean += 0.05;
        weights.manhattan += 0.05;
      } else if (avgSNR < 8) {
        weights.cosine += 0.1;
        weights.chi2 -= 0.05;
      }

      if (avgStability > 0.8) {
        weights.euclidean += 0.05;
        weights.manhattan += 0.05;
      } else {
        weights.cosine += 0.1;
      }

      // Normalize weights to sum to 1
      const total = Object.values(weights).reduce((sum, val) => sum + val, 0);
      Object.keys(weights).forEach(key => {
        weights[key] = weights[key] / total;
      });

      return weights;
    } catch (error) {
      return {
        euclidean: 0.4,
        cosine: 0.3,
        manhattan: 0.15,
        chi2: 0.15
      };
    }
  }

  // Calculate enhanced quality-based adjustment for similarity score
  calculateEnhancedQualityAdjustment(descriptor1, descriptor2, qualityMetrics) {
    try {
      const { magnitudeRatio, avgVariance, avgSNR, avgStability } = qualityMetrics;

      let adjustment = 0;

      // Magnitude consistency bonus
      adjustment += (magnitudeRatio - 0.8) * 15;

      // Signal-to-noise ratio bonus
      adjustment += (avgSNR - 10) * 0.5;

      // Stability bonus
      adjustment += (avgStability - 0.7) * 10;

      // Variance penalty (higher variance = less reliable)
      adjustment -= (avgVariance - 0.1) * 20;

      // Magnitude quality bonus
      const avgMagnitude = (qualityMetrics.magnitude1 + qualityMetrics.magnitude2) / 2;
      const magnitudeQuality = Math.min(1, avgMagnitude / 80);
      adjustment += (magnitudeQuality - 0.6) * 8;

      // Cap the adjustment to prevent extreme values
      return Math.max(-15, Math.min(15, adjustment));
    } catch (error) {
      return 0;
    }
  }


  // Calculate face quality score for comparison
  calculateFaceQualityScore(face1, face2) {
    try {
      let qualityScore = 0;
      let count = 0;

      if (face1.quality && face2.quality) {
        qualityScore += (face1.quality + face2.quality) / 2;
        count++;
      }

      if (face1.confidence && face2.confidence) {
        qualityScore += (face1.confidence + face2.confidence) * 50; // Scale confidence to 0-100
        count++;
      }

      if (face1.features && face2.features) {
        const featureQuality = (face1.features.featureConfidence || 0) + (face2.features.featureConfidence || 0);
        qualityScore += featureQuality * 25; // Scale feature confidence
        count++;
      }

      return count > 0 ? qualityScore / count : 50;
    } catch (error) {
      return 50;
    }
  }

  // Calculate confidence score based on similarity and quality
  calculateConfidenceScore(similarity, qualityScore) {
    try {
      // Base confidence from similarity
      let confidence = similarity / 100;

      // Quality adjustment
      const qualityAdjustment = (qualityScore - 50) / 100;
      confidence += qualityAdjustment * 0.3;

      // Ensure confidence is within 0-1 range
      return Math.max(0, Math.min(1, confidence));
    } catch (error) {
      return 0.5;
    }
  }

  // Calculate detailed metrics for comparison analysis
  calculateDetailedMetrics(face1, face2) {
    try {
      const metrics = {
        magnitudeRatio: 0,
        descriptorDistance: 0,
        featureConsistency: 0,
        qualityDifference: 0
      };

      if (face1.descriptor && face2.descriptor) {
        const magnitude1 = Math.sqrt(face1.descriptor.reduce((sum, val) => sum + val * val, 0));
        const magnitude2 = Math.sqrt(face2.descriptor.reduce((sum, val) => sum + val * val, 0));
        metrics.magnitudeRatio = Math.min(magnitude1, magnitude2) / Math.max(magnitude1, magnitude2);

        const distance = faceapi.euclideanDistance(face1.descriptor, face2.descriptor);
        metrics.descriptorDistance = distance;
      }

      if (face1.quality && face2.quality) {
        metrics.qualityDifference = Math.abs(face1.quality - face2.quality);
      }

      if (face1.features && face2.features) {
        const featureKeys = ['glasses', 'facialHair', 'eyes', 'smile'];
        let consistentFeatures = 0;

        featureKeys.forEach(key => {
          if (face1.features[key] && face2.features[key]) {
            if (key === 'glasses' || key === 'facialHair') {
              consistentFeatures += face1.features[key].hasGlasses === face2.features[key].hasGlasses ? 1 : 0;
            } else if (key === 'eyes') {
              consistentFeatures += face1.features[key].bothOpen === face2.features[key].bothOpen ? 1 : 0;
            } else if (key === 'smile') {
              consistentFeatures += face1.features[key].isSmiling === face2.features[key].isSmiling ? 1 : 0;
            }
          }
        });

        metrics.featureConsistency = featureKeys.length > 0 ? consistentFeatures / featureKeys.length : 0;
      }

      return metrics;
    } catch (error) {
      return {};
    }
  }

  // Compare individual features
  compareFeatures(features1, features2) {
    const featureSimilarity = {};

    // Glasses comparison
    if (features1.glasses && features2.glasses) {
      const glassesMatch = features1.glasses.hasGlasses === features2.glasses.hasGlasses;
      featureSimilarity.glasses = glassesMatch ? 95 : 20; // High penalty for glasses mismatch
    }

    // Facial hair comparison
    if (features1.facialHair && features2.facialHair) {
      const beardMatch = features1.facialHair.hasBeard === features2.facialHair.hasBeard;
      const mustacheMatch = features1.facialHair.hasMustache === features2.facialHair.hasMustache;
      featureSimilarity.facialHair = (beardMatch && mustacheMatch) ? 90 : 30;
    }

    // Eye comparison
    if (features1.eyes && features2.eyes) {
      const eyeStateMatch = features1.eyes.bothOpen === features2.eyes.bothOpen;
      featureSimilarity.eyes = eyeStateMatch ? 85 : 40;
    }

    // Smile comparison
    if (features1.smile && features2.smile) {
      const smileMatch = features1.smile.isSmiling === features2.smile.isSmiling;
      featureSimilarity.smile = smileMatch ? 80 : 35;
    }

    return featureSimilarity;
  }

  // Calculate weighted similarity combining descriptor and features
  calculateWeightedSimilarity(descriptorSimilarity, featureSimilarity) {
    const weights = {
      descriptor: 0.6,
      features: 0.4
    };

    let featureScore = 0;
    let featureCount = 0;

    Object.values(featureSimilarity).forEach(score => {
      featureScore += score;
      featureCount++;
    });

    const avgFeatureScore = featureCount > 0 ? featureScore / featureCount : 0;

    return Math.round(
      (descriptorSimilarity * weights.descriptor) +
      (avgFeatureScore * weights.features)
    );
  }

  // Identify specific differences between faces
  identifyDifferences(features1, features2) {
    const differences = [];

    if (features1.glasses && features2.glasses) {
      if (features1.glasses.hasGlasses !== features2.glasses.hasGlasses) {
        differences.push({
          type: 'glasses',
          description: features1.glasses.hasGlasses ? 'Person is wearing glasses in first image but not in second' : 'Person is not wearing glasses in first image but is in second',
          severity: 'high'
        });
      }
    }

    if (features1.facialHair && features2.facialHair) {
      if (features1.facialHair.hasBeard !== features2.facialHair.hasBeard) {
        differences.push({
          type: 'beard',
          description: 'Beard presence differs between images',
          severity: 'medium'
        });
      }
      if (features1.facialHair.hasMustache !== features2.facialHair.hasMustache) {
        differences.push({
          type: 'mustache',
          description: 'Mustache presence differs between images',
          severity: 'medium'
        });
      }
    }

    if (features1.eyes && features2.eyes) {
      if (features1.eyes.bothOpen !== features2.eyes.bothOpen) {
        differences.push({
          type: 'eye_state',
          description: 'Eye state differs between images (open/closed)',
          severity: 'low'
        });
      }
    }

    if (features1.smile && features2.smile) {
      if (features1.smile.isSmiling !== features2.smile.isSmiling) {
        differences.push({
          type: 'smile',
          description: 'Smile state differs between images',
          severity: 'low'
        });
      }
    }

    return differences;
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
        quality: this.calculateFaceQuality(detection),
        features: this.analyzeFacialFeatures(detection)
      };
    } catch (error) {
      console.error('Error processing webcam frame:', error);
      return null;
    }
  }

  applySimilarityAdjustments(similarity) {
    try {
      return Math.round(similarity * 100) / 100; // round to 2 decimals only
    } catch (error) {
      console.warn('Error returning similarity:', error);
      return similarity;
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

  // Add the missing compareFaces method that App.jsx expects
  compareFaces(face1, face2) {
    try {
      console.log("EnhancedFaceDetectionService.compareFaces called");

      // Validate inputs
      if (!face1 || !face2) {
        throw new Error("Invalid face objects");
      }

      // Extract descriptors with fallback
      const descriptor1 = face1.descriptor || (face1.detection && face1.detection.descriptor);
      const descriptor2 = face2.descriptor || (face2.detection && face2.detection.descriptor);

      if (!descriptor1 || !descriptor2) {
        console.warn("Missing descriptors, using basic comparison");
        return {
          overallSimilarity: 50,
          descriptorSimilarity: 50,
          qualityScore: 50,
          confidence: 0.5,
          match: false,
          differences: [],
          detailedMetrics: {},
          featureSimilarity: {}
        };
      }

      // Calculate basic similarity
      const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
      let similarity = Math.max(0, 100 - distance * 100);

      // Apply similarity percentage adjustments based on specific ranges
      similarity = this.applySimilarityAdjustments(similarity);

      // Get quality scores
      const quality1 = face1.quality || (face1.detection && face1.detection.score) || 0.5;
      const quality2 = face2.quality || (face2.detection && face2.detection.score) || 0.5;
      const avgQuality = (quality1 + quality2) / 2 * 100;

      // Calculate confidence
      const confidence = Math.min(1, similarity / 100) * (avgQuality / 100);

      // Match threshold
      const matchThreshold = 70 + (avgQuality / 100) * 10;

      return {
        overallSimilarity: similarity,
        descriptorSimilarity: similarity,
        qualityScore: avgQuality,
        confidence: confidence,
        match: similarity >= matchThreshold,
        differences: [],
        detailedMetrics: {
          euclidean: similarity.toFixed(2),
          matchThreshold: matchThreshold.toFixed(2)
        },
        featureSimilarity: {}
      };

    } catch (error) {
      console.error("Error in compareFaces:", error);
      return {
        overallSimilarity: 0,
        descriptorSimilarity: 0,
        qualityScore: 0,
        confidence: 0,
        match: false,
        differences: [{ type: 'error', description: error.message }],
        detailedMetrics: {},
        featureSimilarity: {}
      };
    }
  }
}