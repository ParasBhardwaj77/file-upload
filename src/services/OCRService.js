
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

      // Find Aadhaar number
      const aadhaarLine = lines.find(line => 
        /\d{4}\s?\d{4}\s?\d{4}/.test(line)
      );
      
      if (aadhaarLine) {
        aadhaarNumber = aadhaarLine
          .replace(/\D/g, "")
          .substring(0, 12)
          .replace(/(\d{4})(?=\d)/g, "$1 ");
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
