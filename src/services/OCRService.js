
import Tesseract from 'tesseract.js';

export class OCRService {
  constructor() {
    this.worker = null;
    this.isProcessing = false;
  }

  // Initialize Tesseract worker
  async initializeWorker() {
    if (!this.worker) {
      this.worker = await Tesseract.createWorker({
        logger: m => console.log(m),
      });
      await this.worker.loadLanguage('eng');
      await this.worker.initialize('eng');
    }
  }

  // Extract text from image
  async extractText(imageData, options = {}) {
    try {
      await this.initializeWorker();
      
      const {
        lang = 'eng',
        tessedit_pageseg_mode = Tesseract.PSM.AUTO,
        preserve_interword_spaces = true
      } = options;

      const result = await this.worker.recognize(imageData, lang, {
        tessedit_pageseg_mode,
        preserve_interword_spaces,
      });

      return {
        text: result.data.text,
        confidence: result.data.confidence,
        words: result.data.words,
        lines: this.extractLines(result.data.text)
      };
    } catch (error) {
      console.error('OCR extraction error:', error);
      throw new Error('Text extraction failed');
    }
  }

  // Extract lines from text
  extractLines(text) {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  // Estimate text size based on various heuristics
  estimateTextSize(text) {
    let sizeScore = 0;
    
    // Length of the line (longer lines might contain larger text)
    sizeScore += text.length * 2;
    
    // Presence of digits (Aadhaar numbers are numeric)
    const digitCount = (text.match(/\d/g) || []).length;
    sizeScore += digitCount * 3;
    
    // Presence of spaces (Aadhaar numbers often have spaces)
    const spaceCount = (text.match(/\s/g) || []).length;
    sizeScore += spaceCount * 1;
    
    // Check if line contains only digits and spaces (typical Aadhaar format)
    const isNumericOnly = /^[0-9\s]+$/.test(text);
    if (isNumericOnly) {
      sizeScore += 20;
    }
    
    // Check for typical Aadhaar number patterns
    const hasAadhaarPattern = /\d{4}\s?\d{4}\s?\d{4}/.test(text);
    if (hasAadhaarPattern) {
      sizeScore += 15;
    }
    
    // Bonus for lines with exactly 12 digits (perfect match)
    const hasExactly12Digits = (text.match(/\d/g) || []).length === 12;
    if (hasExactly12Digits) {
      sizeScore += 25;
    }
    
    // Bonus for consecutive digits without other characters
    const hasConsecutive12Digits = /\d{12}/.test(text);
    if (hasConsecutive12Digits) {
      sizeScore += 30;
    }
    
    return sizeScore;
  }

  // Extract Aadhaar card information
  async extractAadhaarInfo(textData, imageData) {
    try {
      const { text, lines } = textData;
      
      // Find date of birth
      const dobLineIndex = lines.findIndex(line => 
        /\d{2}\/\d{2}\/\d{4}/.test(line)
      );
      
      let name = "Not found";
      let dob = "Not found";
      let aadhaarNumber = "Not found";

      if (dobLineIndex >= 0) {
        dob = lines[dobLineIndex].match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || "Not found";
        if (dobLineIndex > 0) {
          name = lines[dobLineIndex - 1].replace(/[^a-zA-Z\s]/g, "").trim();
        }
      }

      // Find Aadhaar number using specific logic:
      // 1. Aadhar no. has exactly 12 numbers
      // 2. Aadhar number is bigger in size as compared to other numbers
      // 3. Numbers should be together (consecutive)
      let potentialAadhaarNumbers = [];
      
      // First, find all lines with exactly 12 consecutive digits
      for (const line of lines) {
        // Find all sequences of exactly 12 consecutive digits
        const matches = line.match(/\d{12}/g);
        if (matches) {
          matches.forEach(match => {
            potentialAadhaarNumbers.push({
              number: match,
              line: line,
              size: this.estimateTextSize(line),
              consecutive: true,
              digitCount: 12
            });
          });
        }
      }
      
      // If no exact 12-digit consecutive numbers found, look for lines with exactly 12 digits total
      if (potentialAadhaarNumbers.length === 0) {
        for (const line of lines) {
          const allDigits = line.replace(/\D/g, '');
          if (allDigits.length === 12) {
            potentialAadhaarNumbers.push({
              number: allDigits,
              line: line,
              size: this.estimateTextSize(line),
              consecutive: true,
              digitCount: 12
            });
          }
        }
      }
      
      // If still no match, look for lines with 12+ digits but extract only first 12
      if (potentialAadhaarNumbers.length === 0) {
        for (const line of lines) {
          const allDigits = line.replace(/\D/g, '');
          if (allDigits.length >= 12) {
            // Extract only first 12 digits
            const first12Digits = allDigits.substring(0, 12);
            potentialAadhaarNumbers.push({
              number: first12Digits,
              line: line,
              size: this.estimateTextSize(line),
              consecutive: false,
              digitCount: 12
            });
          }
        }
      }
      
      // Select the largest number (assuming Aadhaar numbers are bigger in size)
      if (potentialAadhaarNumbers.length > 0) {
        // Prioritize consecutive numbers over non-consecutive ones
        potentialAadhaarNumbers.sort((a, b) => {
          if (a.consecutive && !b.consecutive) return -1;
          if (!a.consecutive && b.consecutive) return 1;
          return b.size - a.size;
        });
        
        // Ensure we only take exactly 12 digits
        aadhaarNumber = potentialAadhaarNumbers[0].number.substring(0, 12);
        aadhaarNumber = aadhaarNumber.replace(/(\d{4})(?=\d)/g, "$1 ");
      }

      // Extract additional information
      const additionalInfo = this.extractAdditionalInfo(lines);

      return {
        type: 'Aadhaar',
        name,
        dob,
        number: aadhaarNumber,
        confidence: this.calculateConfidence(text, name, dob, aadhaarNumber),
        additionalInfo
      };
    } catch (error) {
      console.error('Aadhaar extraction error:', error);
      throw new Error('Aadhaar information extraction failed');
    }
  }

  // Extract PAN card information
  async extractPanInfo(textData, imageData) {
    try {
      const { text, lines } = textData;
      
      let name = "Not found";
      let dob = "Not found";
      let panNumber = "Not found";

      // Find PAN number
      const panLine = lines.find(line => 
        /[A-Z]{5}[0-9]{4}[A-Z]{1}/i.test(line)
      );
      
      if (panLine) {
        panNumber = panLine.match(/[A-Z]{5}[0-9]{4}[A-Z]{1}/i)[0].toUpperCase();
      }

      // Find name (usually near "Name" label)
      const nameLineIndex = lines.findIndex(line => 
        line.toLowerCase().includes("name") && 
        !line.toLowerCase().includes("father")
      );
      
      if (nameLineIndex >= 0 && nameLineIndex + 1 < lines.length) {
        name = lines[nameLineIndex + 1].replace(/[^a-zA-Z\s]/g, "").trim();
      }

      // Find date of birth
      const dobLine = lines.find(line => /\d{2}\/\d{2}\/\d{4}/.test(line));
      if (dobLine) {
        dob = dobLine.match(/\d{2}\/\d{2}\/\d{4}/)[0];
      }

      // Extract additional information
      const additionalInfo = this.extractAdditionalInfo(lines);

      return {
        type: 'PAN',
        name,
        dob,
        number: panNumber,
        confidence: this.calculateConfidence(text, name, dob, panNumber),
        additionalInfo
      };
    } catch (error) {
      console.error('PAN extraction error:', error);
      throw new Error('PAN information extraction failed');
    }
  }

  // Extract additional information from ID card
  extractAdditionalInfo(lines) {
    const additionalInfo = {};
    
    // Find address
    const addressLines = [];
    let inAddress = false;
    
    for (const line of lines) {
      if (line.toLowerCase().includes('address')) {
        inAddress = true;
        continue;
      }
      if (inAddress && line.length > 10) {
        addressLines.push(line);
      } else if (inAddress && line.length < 10) {
        break;
      }
    }
    
    additionalInfo.address = addressLines.join(', ') || "Not found";
    
    // Find gender
    const genderLine = lines.find(line => 
      line.toLowerCase().includes('male') || 
      line.toLowerCase().includes('female') ||
      line.toLowerCase().includes('m') ||
      line.toLowerCase().includes('f')
    );
    
    if (genderLine) {
      additionalInfo.gender = genderLine.toLowerCase().includes('male') || 
                           genderLine.toLowerCase().includes('m') ? 'Male' : 'Female';
    } else {
      additionalInfo.gender = "Not found";
    }

    return additionalInfo;
  }

  // Calculate confidence score for extracted information
  calculateConfidence(text, name, dob, number) {
    let confidence = 0;
    
    // Base confidence from text length
    confidence += Math.min(text.length / 100, 20);
    
    // Name confidence
    if (name !== "Not found" && name.length > 2) {
      confidence += 25;
    }
    
    // DOB confidence
    if (dob !== "Not found" && /\d{2}\/\d{2}\/\d{4}/.test(dob)) {
      confidence += 25;
    }
    
    // Number confidence
    if (number !== "Not found" && number.length > 8) {
      confidence += 30;
    }
    
    return Math.min(confidence, 100);
  }

  // Process ID card image
  async processIDCard(imageData, idType = 'aadhaar') {
    try {
      this.isProcessing = true;
      
      // Extract text from image
      const textData = await this.extractText(imageData);
      
      // Extract specific ID information
      let extractedInfo;
      if (idType.toLowerCase() === 'aadhaar') {
        extractedInfo = await this.extractAadhaarInfo(textData, imageData);
      } else if (idType.toLowerCase() === 'pan') {
        extractedInfo = await this.extractPanInfo(textData, imageData);
      } else {
        throw new Error('Unsupported ID type');
      }

      return {
        ...extractedInfo,
        isProcessing: this.isProcessing
      };
    } catch (error) {
      console.error('ID card processing error:', error);
      throw new Error('ID card processing failed');
    } finally {
      this.isProcessing = false;
    }
  }
}
