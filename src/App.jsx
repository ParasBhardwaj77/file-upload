import { useState, useEffect, useRef } from "react";
import * as faceapi from "@vladmandic/face-api";
import Tesseract from "tesseract.js";
import Webcam from "react-webcam";
import UploadIcon from "./assets/upload.svg";

export default function App() {
  const [proofType, setProofType] = useState("");
  const [frontImg, setFrontImg] = useState(null);
  const [backImg, setBackImg] = useState(null);
  const [faceImg, setFaceImg] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [matchResult, setMatchResult] = useState(null);
  const [similarityPercentage, setSimilarityPercentage] = useState(null);
  const webcamRef = useRef(null);
  const faceImageRef = useRef(null);

  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = "/models";
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      console.log("✅ FaceAPI models loaded");
    };
    loadModels();
  }, []);

  const handleFrontUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const imgURL = URL.createObjectURL(file);
      setFrontImg(imgURL);
      setFaceImg(null);
      setInfo(null);
      setLoading(true);
      await detectFace(imgURL);
      await extractInfo(imgURL);
      setLoading(false);
    }
  };

  const handleBackUpload = (e) => {
    const file = e.target.files[0];
    if (file) setBackImg(URL.createObjectURL(file));
  };

  const detectFace = async (imgURL) => {
    const img = await faceapi.fetchImage(imgURL);
    const detection = await faceapi
      .detectSingleFace(
        img,
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
      )
      .withFaceLandmarks();

    if (detection) {
      const { x, y, width, height } = detection.detection.box;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const marginX = width * 0.3;
      const marginY = height * 0.4;

      const sx = Math.max(0, x - marginX);
      const sy = Math.max(0, y - marginY);
      const sWidth = width + marginX * 2;
      const sHeight = height + marginY * 2;

      canvas.width = sWidth;
      canvas.height = sHeight;
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
      setFaceImg(canvas.toDataURL("image/png"));
    } else {
      console.warn("⚠️ No face detected");
    }
  };

  // Face comparison function
  const compareFaces = async () => {
    if (!faceImg) {
      alert("No detected face image available!");
      return;
    }
    if (!webcamRef.current) {
      alert("Webcam not available!");
      return;
    }

    try {
      setLoading(true);
      setMatchResult(null);
      setSimilarityPercentage(null);

      // Create image element for detected face
      const faceImage = new Image();
      faceImage.src = faceImg;
      await new Promise((resolve) => {
        faceImage.onload = resolve;
      });

      // Detect face from detected face image
      const faceDetection = await faceapi
        .detectSingleFace(faceImage)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!faceDetection) {
        alert("No face found in detected face image!");
        setLoading(false);
        return;
      }

      // Capture current frame from webcam
      const canvas = document.createElement("canvas");
      const video = webcamRef.current.video;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Detect face from webcam capture
      const webcamDetection = await faceapi
        .detectSingleFace(canvas)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!webcamDetection) {
        alert("No face found in webcam capture!");
        setLoading(false);
        return;
      }

      // Calculate similarity using euclidean distance
      const distance = faceapi.euclideanDistance(
        faceDetection.descriptor,
        webcamDetection.descriptor
      );

      // Convert distance to percentage (lower distance = higher similarity)
      // Distance typically ranges from 0 to 1, where 0 is identical
      const maxDistance = 1.0;
      const similarity = Math.max(
        0,
        Math.round((1 - distance / maxDistance) * 100)
      );

      setSimilarityPercentage(similarity);
      setMatchResult(`Distance: ${distance.toFixed(4)}`);
      setLoading(false);
    } catch (error) {
      console.error("Face comparison error:", error);
      alert("Error during face comparison. Please try again.");
      setLoading(false);
    }
  };

  const extractInfo = async (imgURL) => {
    try {
      const result = await Tesseract.recognize(imgURL, "eng");
      const text = result.data.text;
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      let name = "Not found";
      let dob = "Not found";
      let nationality = "Not found";
      let passportNumber = "Not found";
      let serialNumber = "Not found";
      let passportExpiry = "Not found";
      let additionalFields = {};

      if (proofType === "aadhaar") {
        const dobLineIndex = lines.findIndex((line) =>
          /\d{2}\/\d{2}\/\d{4}/.test(line)
        );
        if (dobLineIndex >= 0) {
          dob =
            lines[dobLineIndex].match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ||
            "Not found";
          if (dobLineIndex > 0)
            name = lines[dobLineIndex - 1].replace(/[^a-zA-Z\s]/g, "").trim();
        }

        const aadhaarLine = lines.find((line) =>
          /\d{4}\s?\d{4}\s?\d{4}/.test(line)
        );
        if (aadhaarLine)
          nationality = aadhaarLine
            .replace(/\D/g, "")
            .replace(/(\d{4})(?=\d)/g, "$1 ");
      } else if (proofType === "pan") {
        const panLineIndex = lines.findIndex((line) =>
          /[A-Z]{5}[0-9]{4}[A-Z]{1}/i.test(line)
        );
        if (panLineIndex >= 0) {
          nationality = lines[panLineIndex].match(
            /[A-Z]{5}[0-9]{4}[A-Z]{1}/i
          )[0];

          const nameLineIndex = lines.findIndex(
            (line) =>
              line.toLowerCase().includes("name") &&
              !line.toLowerCase().includes("father")
          );
          if (nameLineIndex >= 0 && nameLineIndex + 1 < lines.length) {
            name = lines[nameLineIndex + 1].replace(/[^a-zA-Z\s]/g, "").trim();
          }
        }

        const dobLine = lines.find((line) => /\d{2}\/\d{2}\/\d{4}/.test(line));
        if (dobLine) dob = dobLine.match(/\d{2}\/\d{2}\/\d{4}/)[0];
      } else if (proofType === "other") {
        const dobLineIndex = lines.findIndex((line) =>
          /\d{2}\/\d{2}\/\d{4}/.test(line)
        );
        if (dobLineIndex >= 0) {
          dob =
            lines[dobLineIndex].match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ||
            "Not found";
        }

        // Extract name by searching for lines containing "NAME"
        const nameLineIndex = lines.findIndex((line) =>
          line.toUpperCase().includes("NAME")
        );
        if (nameLineIndex >= 0) {
          name = lines[nameLineIndex].replace(/[^a-zA-Z\s]/g, "").trim();
          // If "NAME" is in the line, get the text after it
          if (name.toUpperCase().includes("NAME")) {
            const nameParts = name.split(/NAME/i);
            if (nameParts.length > 1) {
              name = nameParts[1].trim();
            }
          }
        }

        // Extract passport number
        // Common passport number patterns
        const passportPatterns = [
          /[A-Z]{2}\d{7}/, // Standard format: 2 letters + 7 digits
          /\d{9}/, // 9 digits
          /[A-Z]\d{8}/, // 1 letter + 8 digits
          /[A-Z]{3}\d{6}/, // 3 letters + 6 digits
          /\d{8,9}/, // 8 or 9 digits
          /[A-Z]{1,2}\d{6,8}/, // 1-2 letters + 6-8 digits
        ];

        // Also look for lines containing "PASSPORT" or "PASS NO" or "PASS#"
        const passportTermIndex = lines.findIndex(
          (line) =>
            line.toUpperCase().includes("PASSPORT") ||
            line.toUpperCase().includes("PASS NO") ||
            line.toUpperCase().includes("PASS#")
        );

        if (passportTermIndex >= 0) {
          const line = lines[passportTermIndex];
          // Try to find passport number in the same line
          for (const pattern of passportPatterns) {
            const match = line.match(pattern);
            if (match) {
              passportNumber = match[0];
              break;
            }
          }
          // If not found in same line, check next line
          if (
            passportNumber === "Not found" &&
            passportTermIndex + 1 < lines.length
          ) {
            const nextLine = lines[passportTermIndex + 1];
            for (const pattern of passportPatterns) {
              const match = nextLine.match(pattern);
              if (match) {
                passportNumber = match[0];
                break;
              }
            }
          }
        } else {
          // If no passport terms found, search for patterns in all lines
          for (const line of lines) {
            for (const pattern of passportPatterns) {
              const match = line.match(pattern);
              if (match) {
                passportNumber = match[0];
                break;
              }
            }
            if (passportNumber !== "Not found") break;
          }
        }

        // Extract serial number (could be various formats)
        const serialPatterns = [
          /[A-Z]{2}\d{7,8}/, // 2 letters + 7-8 digits
          /\d{10,12}/, // 10-12 digits
          /[A-Z]\d{9,10}/, // 1 letter + 9-10 digits
          /[A-Z]{3,4}\d{5,6}/, // 3-4 letters + 5-6 digits
          /\d{8,9}[A-Z]?\d{1,2}/, // 8-9 digits + optional letter + 1-2 digits
        ];

        // Look for serial number patterns
        for (const line of lines) {
          for (const pattern of serialPatterns) {
            const match = line.match(pattern);
            if (match) {
              serialNumber = match[0];
              break;
            }
          }
          if (serialNumber !== "Not found") break;
        }

        // Extract passport expiry date
        const expiryPatterns = [
          /\d{2}\/\d{2}\/\d{4}/, // DD/MM/YYYY
          /\d{2}-\d{2}-\d{4}/, // DD-MM-YYYY
          /\d{4}-\d{2}-\d{2}/, // YYYY-MM-DD
          /\d{2}\/\d{2}\/\d{2}/, // DD/MM/YY
          /\d{2}-\d{2}\/\d{4}/, // DD-MM/YYYY
          /(?:EXP|EXPIRY|EXPIRES|VALID\s*UNTIL|VALID\s*THRU)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
        ];

        // Look for expiry terms first
        const expiryTermIndex = lines.findIndex(
          (line) =>
            line.toUpperCase().includes("EXP") ||
            line.toUpperCase().includes("EXPIRY") ||
            line.toUpperCase().includes("EXPIRES") ||
            line.toUpperCase().includes("VALID UNTIL") ||
            line.toUpperCase().includes("VALID THRU")
        );

        if (expiryTermIndex >= 0) {
          const line = lines[expiryTermIndex];
          // Try to find expiry date in the same line
          for (const pattern of expiryPatterns) {
            const match = line.match(pattern);
            if (match) {
              passportExpiry = match[1] || match[0];
              break;
            }
          }
          // If not found in same line, check next line
          if (
            passportExpiry === "Not found" &&
            expiryTermIndex + 1 < lines.length
          ) {
            const nextLine = lines[expiryTermIndex + 1];
            for (const pattern of expiryPatterns) {
              const match = nextLine.match(pattern);
              if (match) {
                passportExpiry = match[1] || match[0];
                break;
              }
            }
          }
        } else {
          // If no expiry terms found, search for date patterns in all lines
          for (const line of lines) {
            for (const pattern of expiryPatterns) {
              const match = line.match(pattern);
              if (match) {
                passportExpiry = match[1] || match[0];
                break;
              }
            }
            if (passportExpiry !== "Not found") break;
          }
        }

        // Extract additional fields by looking for common ID card terms
        const additionalTerms = {
          GENDER: "gender",
          SEX: "gender",
          FATHER: "fatherName",
          MOTHER: "motherName",
          SPOUSE: "spouseName",
          "ISSUING AUTHORITY": "issuingAuthority",
          "PLACE OF BIRTH": "placeOfBirth",
          "DATE OF ISSUE": "dateOfIssue",
          "ID NO": "idNumber",
          "DOCUMENT NO": "documentNumber",
          "FILE NO": "fileNumber",
        };

        for (const [term, field] of Object.entries(additionalTerms)) {
          const termIndex = lines.findIndex((line) =>
            line.toUpperCase().includes(term)
          );
          if (termIndex >= 0) {
            const line = lines[termIndex];
            let value = "Not found";

            // Try to get value from same line after the term
            const termParts = line.split(new RegExp(term, "i"));
            if (termParts.length > 1) {
              value = termParts[1].trim().replace(/[^a-zA-Z0-9\s\/\-]/g, "");
            }
            // If no value found in same line, check next line
            else if (termIndex + 1 < lines.length) {
              value = lines[termIndex + 1]
                .trim()
                .replace(/[^a-zA-Z0-9\s\/\-]/g, "");
            }

            if (value && value.length > 1 && value.length < 100) {
              additionalFields[field] = value;
            }
          }
        }

        // Extract nationality by searching for country names or nationality terms
        const countryNames = [
          "INDIA",
          "USA",
          "UNITED STATES",
          "UK",
          "UNITED KINGDOM",
          "CANADA",
          "AUSTRALIA",
          "GERMANY",
          "FRANCE",
          "ITALY",
          "SPAIN",
          "JAPAN",
          "CHINA",
          "BRAZIL",
          "RUSSIA",
          "SWITZERLAND",
          "NORWAY",
          "SWEDEN",
          "DENMARK",
          "FINLAND",
          "NETHERLANDS",
          "BELGIUM",
          "AUSTRIA",
          "IRELAND",
          "NEW ZEALAND",
          "SINGAPORE",
          "MALAYSIA",
          "THAILAND",
          "SOUTH KOREA",
          "MEXICO",
          "ARGENTINA",
          "CHILE",
          "COLOMBIA",
          "VENEZUELA",
          "PERU",
          "EGYPT",
          "SOUTH AFRICA",
          "KENYA",
          "NIGERIA",
          "GHANA",
          "MOROCCO",
          "TURKEY",
          "SAUDI ARABIA",
          "UAE",
          "QATAR",
          "KUWAIT",
          "OMAN",
          "PAKISTAN",
          "BANGLADESH",
          "NEPAL",
          "SRI LANKA",
          "MYANMAR",
          "VIETNAM",
          "INDONESIA",
          "PHILIPPINES",
          "CAMBODIA",
          "LAOS",
        ];

        const nationalityTerms = [
          "NATIONALITY",
          "CITIZENSHIP",
          "CITIZEN",
          "NATIONAL",
          "ORIGIN",
          "DOMICILE",
          "RESIDENT",
          "BELONGS TO",
          "FROM",
        ];

        // First try to find nationality terms
        for (const term of nationalityTerms) {
          const termIndex = lines.findIndex((line) =>
            line.toUpperCase().includes(term)
          );
          if (termIndex >= 0) {
            // Check if there's text after the term
            const line = lines[termIndex];
            const termParts = line.split(new RegExp(term, "i"));
            if (termParts.length > 1) {
              const potentialNationality = termParts[1]
                .trim()
                .replace(/[^a-zA-Z\s]/g, "");
              if (potentialNationality) {
                nationality = potentialNationality;
                break;
              }
            }
            // Check next line if current line doesn't have nationality after term
            if (termIndex + 1 < lines.length) {
              const nextLine = lines[termIndex + 1]
                .replace(/[^a-zA-Z\s]/g, "")
                .trim();
              if (nextLine && nextLine.length > 1 && nextLine.length < 50) {
                nationality = nextLine;
                break;
              }
            }
          }
        }

        // If no nationality found with terms, try to find country names
        if (nationality === "Not found") {
          for (const country of countryNames) {
            const countryIndex = lines.findIndex((line) =>
              line.toUpperCase().includes(country)
            );
            if (countryIndex >= 0) {
              nationality = country;
              break;
            }
          }
        }
      }

      setInfo({
        type:
          proofType === "aadhaar"
            ? "Aadhaar"
            : proofType === "pan"
            ? "PAN"
            : "Other",
        name,
        dob,
        number:
          proofType === "other"
            ? nationality
            : proofType === "aadhaar"
            ? nationality
            : nationality,
        passportNumber: proofType === "other" ? passportNumber : "Not found",
        serialNumber: proofType === "other" ? serialNumber : "Not found",
        passportExpiry: proofType === "other" ? passportExpiry : "Not found",
        additionalFields: proofType === "other" ? additionalFields : {},
      });
    } catch (err) {
      console.error("OCR error:", err);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <main className="flex-1 bg-white p-6 shadow-md">
        <div className="border-t-2 border-b-2 border-gray-400 p-4">
          <h2 className="text-2xl font-bold mb-4">Proof of Identity (POI)</h2>

          <fieldset className="border border-gray-500 rounded px-2 py-1 mb-4">
            <legend className="px-1 text-gray-700 font-semibold text-sm">
              Proof of Identity Type
            </legend>
            <select
              value={proofType}
              onChange={(e) => setProofType(e.target.value)}
              className="w-full p-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
            >
              <option value="">-- Select Proof Type --</option>
              <option value="aadhaar">Aadhaar Card</option>
              <option value="pan">PAN Card</option>
              <option value="other">Other</option>
            </select>
          </fieldset>

          {/* Upload Front */}
          <div className="mb-4">
            <label
              htmlFor="frontUpload"
              className="flex items-center gap-2 p-4 border-2 border-dashed border-gray-500 rounded cursor-pointer hover:bg-gray-50"
            >
              <div className="border border-2 border-gray-500 p-2 rounded-2xl">
                <img src={UploadIcon} alt="Upload Icon" className="h-20 w-30" />
              </div>
              <div className="pl-3">
                <span className="text-gray-700 font-medium">
                  <span className="text-blue-500">Upload</span>{" "}
                  {proofType === "aadhaar"
                    ? "Aadhaar"
                    : proofType === "pan"
                    ? "PAN"
                    : "Other"}{" "}
                  front
                  <div>Only .jpg, .pdf, .png, max size 5MB</div>
                </span>
              </div>
            </label>
            <input
              id="frontUpload"
              type="file"
              accept="image/*"
              onChange={handleFrontUpload}
              className="hidden"
            />
          </div>

          {/* Upload Back */}
          <div className="mb-4">
            <label
              htmlFor="backUpload"
              className="flex items-center gap-2 p-4 border-2 border-dashed border-gray-500 rounded cursor-pointer hover:bg-gray-50"
            >
              <div className="border border-2 border-gray-500 p-2 rounded-2xl">
                <img src={UploadIcon} alt="Upload Icon" className="h-20 w-30" />
              </div>
              <div className="pl-3">
                <span className="text-gray-700 font-medium">
                  <span className="text-blue-500">Upload</span>{" "}
                  {proofType === "aadhaar"
                    ? "Aadhaar"
                    : proofType === "pan"
                    ? "PAN"
                    : "Other"}{" "}
                  back
                  <div>Only .jpg, .pdf, .png, max size 5MB</div>
                </span>
              </div>
            </label>
            <input
              id="backUpload"
              type="file"
              accept="image/*"
              onChange={handleBackUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Output */}
        <div className="pt-4">
          <h3 className="text-lg font-semibold mb-3">Uploaded Previews</h3>
          <div className="gap-6">
            {frontImg && (
              <div>
                <h4 className="text-sm font-medium mb-1 text-gray-600">
                  Front Side
                </h4>
                <img
                  src={frontImg}
                  alt="Front Preview"
                  className="w-60 h-40 object-cover rounded border"
                />
              </div>
            )}
            {backImg && (
              <div>
                <h4 className="text-sm font-medium mb-1 text-gray-600">
                  Back Side
                </h4>
                <img
                  src={backImg}
                  alt="Back Preview"
                  className="w-60 h-40 object-cover rounded border"
                />
              </div>
            )}
            {faceImg && (
              <div>
                <h4 className="text-sm font-medium mb-1 text-gray-600">
                  Detected Face
                </h4>
                <img
                  src={faceImg}
                  alt="Detected Face"
                  className="w-40 h-40 object-cover rounded-full border-2 border-green-500"
                />
              </div>
            )}
            {faceImg && (
              <div>
                <h4 className="text-sm font-medium mb-1 text-gray-600">
                  Webcam
                </h4>
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  mirrored={true}
                  screenshotFormat="image/jpeg"
                  className="w-40 h-40 object-cover rounded-full border-2 border-blue-500"
                />
              </div>
            )}
            {faceImg && (
              <div className="mt-4">
                <button
                  onClick={compareFaces}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Compare
                </button>
              </div>
            )}
          </div>

          {/* Processing indicator moved after all images */}
          {loading && <p className="text-blue-500 mt-2">Processing...</p>}

          {/* Match result display */}
          {matchResult && (
            <div className="mt-4 p-4 bg-gray-50 rounded border">
              <h4 className="text-lg font-semibold mb-2 text-gray-700">
                Face Comparison Result
              </h4>
              <p
                className={`text-lg font-medium ${
                  similarityPercentage >= 70
                    ? "text-green-600"
                    : similarityPercentage >= 50
                    ? "text-yellow-600"
                    : "text-red-600"
                }`}
              >
                Similarity: {similarityPercentage}%
              </p>
              <p
                className={`mt-1 ${
                  similarityPercentage >= 70
                    ? "text-green-600"
                    : similarityPercentage >= 50
                    ? "text-yellow-600"
                    : "text-red-600"
                }`}
              >
                {similarityPercentage >= 70
                  ? "✅ Strong Match"
                  : similarityPercentage >= 50
                  ? "⚠️ Possible Match"
                  : "❌ Weak Match"}
              </p>
            </div>
          )}

          {info && (
            <div className="mt-6 bg-gray-50 p-4 rounded border w-fit">
              <h4 className="text-lg font-semibold mb-2 text-gray-700">
                Extracted {info.type} Info
              </h4>
              <p>
                <strong>Name:</strong> {info.name}
              </p>
              <p>
                <strong>DOB:</strong> {info.dob}
              </p>
              <p>
                <strong>
                  {info.type === "Aadhaar"
                    ? "Aadhaar Number"
                    : info.type === "PAN"
                    ? "PAN Number"
                    : "Nationality"}
                  :
                </strong>{" "}
                {info.number}
              </p>
              {info.type === "Other" && info.passportNumber !== "Not found" && (
                <p>
                  <strong>Passport Number:</strong> {info.passportNumber}
                </p>
              )}
              {info.type === "Other" && info.serialNumber !== "Not found" && (
                <p>
                  <strong>Serial Number:</strong> {info.serialNumber}
                </p>
              )}
              {info.type === "Other" && info.passportExpiry !== "Not found" && (
                <p>
                  <strong>Passport Expiry:</strong> {info.passportExpiry}
                </p>
              )}
              {info.type === "Other" &&
                Object.keys(info.additionalFields).length > 0 &&
                Object.entries(info.additionalFields).map(([key, value]) => (
                  <p key={key}>
                    <strong>
                      {key.charAt(0).toUpperCase() +
                        key.slice(1).replace(/([A-Z])/g, " $1")}
                      :
                    </strong>{" "}
                    {value}
                  </p>
                ))}
            </div>
          )}
        </div>
      </main>

      <aside className="w-80 p-6 flex justify-center">
        <h2 className="text-xl font-bold mb-4">Sidebar</h2>
      </aside>
    </div>
  );
}
