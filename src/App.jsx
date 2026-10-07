import { useEffect, useRef, useState } from "react";

// ======================================================
// BACKEND URL
// ======================================================
const API_BASE_URL = "http://localhost:8080/student";

// ======================================================
// HELPERS
// ======================================================

// Safely escape a value for CSV
const csvCell = (value) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

// Build CSV text from a list of students
const buildCSV = (list) => {
  let csv = "ID,Name,Address,Photo Name\n";

  list.forEach((student) => {
    csv +=
      [
        csvCell(student.id),
        csvCell(student.name),
        csvCell(student.address),
        csvCell(student.photoname),
      ].join(",") + "\n";
  });

  return csv;
};

// Download any Blob as a file
const saveBlob = (blob, fileName) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(url);
};

// Download CSV (BOM added so Excel reads it correctly)
const downloadCSV = (csv, fileName) => {
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });

  saveBlob(blob, fileName);
};

// ======================================================
// APP
// ======================================================
function App() {
  // ---------------- Registration form ----------------
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset file input after submit
  const fileInputRef = useRef(null);

  // ---------------- Camera ----------------
  // "upload" = choose a file, "camera" = capture live photo
  const [photoMode, setPhotoMode] = useState("upload");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [facingMode, setFacingMode] = useState("user"); // "user" = front, "environment" = back
  const [photoPreview, setPhotoPreview] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // ---------------- Student data ----------------
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);

  // Photo popup
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [photoError, setPhotoError] = useState(false);

  // ---------------- Search ----------------
  const [search, setSearch] = useState("");

  // ---------------- Pagination ----------------
  const [currentPage, setCurrentPage] = useState(1);
  const [studentsPerPage, setStudentsPerPage] = useState(5);

  // ====================================================
  // CAMERA FUNCTIONS
  // ====================================================

  // Stop the camera stream (turns off the camera light)
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOn(false);
  };

  // Start the camera
  const startCamera = async (facing = facingMode) => {
    setCameraError("");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        "Camera is not supported in this browser, or the page is not on https/localhost."
      );
      return;
    }

    try {
      // Stop any old stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });

      streamRef.current = stream;
      setPhoto(null);
      setCameraOn(true);
    } catch (error) {
      console.error("Camera error:", error);

      if (error.name === "NotAllowedError") {
        setCameraError(
          "Camera permission denied. Allow camera access in the browser address bar and try again."
        );
      } else if (error.name === "NotFoundError") {
        setCameraError("No camera found on this device.");
      } else if (error.name === "NotReadableError") {
        setCameraError("Camera is being used by another app.");
      } else {
        setCameraError("Unable to start the camera.");
      }
    }
  };

  // Attach the stream to the <video> element once it is rendered
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOn]);

  // Switch between front and back camera
  const switchCamera = async () => {
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    await startCamera(next);
  };

  // Capture a photo from the live video
  const capturePhoto = () => {
    const video = videoRef.current;

    if (!video || !video.videoWidth) {
      setCameraError("Camera is not ready yet. Wait a moment and try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError("Unable to capture the photo. Try again.");
          return;
        }

        const file = new File([blob], `camera_${Date.now()}.jpg`, {
          type: "image/jpeg",
        });

        setPhoto(file);
        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  };

  // Throw away the captured photo and open the camera again
  const retakePhoto = () => {
    setPhoto(null);
    startCamera();
  };

  // Switch between "Upload" and "Camera"
  const changePhotoMode = (mode) => {
    if (mode === photoMode) {
      return;
    }

    stopCamera();
    setCameraError("");
    setPhoto(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setPhotoMode(mode);
  };

  // Create / clean up a preview URL whenever the photo changes
  useEffect(() => {
    if (!photo) {
      setPhotoPreview("");
      return;
    }

    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // Turn the camera off when leaving the page
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // ====================================================
  // GET ALL STUDENTS
  // ====================================================
  const getStudents = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_BASE_URL}/all`);

      if (!response.ok) {
        throw new Error("Unable to fetch students");
      }

      const data = await response.json();
      setStudents(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Get students error:", error);
      alert("Unable to load students.");
    } finally {
      setLoading(false);
    }
  };

  // Load students when page opens
  useEffect(() => {
    getStudents();
  }, []);

  // ====================================================
  // REGISTER STUDENT
  // ====================================================
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!photo) {
      alert(
        photoMode === "camera"
          ? "Please capture a photo."
          : "Please select a photo."
      );
      return;
    }

    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("address", address.trim());
    formData.append("photo", photo);

    try {
      setSubmitting(true);

      const response = await fetch(`${API_BASE_URL}/register`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Registration failed");
      }

      alert("Student registered successfully!");

      // Reset form
      setName("");
      setAddress("");
      setPhoto(null);
      stopCamera();
      setCameraError("");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Refresh list and go to first page
      await getStudents();
      setCurrentPage(1);
    } catch (error) {
      console.error("Registration error:", error);
      alert("Student registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  // ====================================================
  // PHOTO POPUP
  // ====================================================
  const viewPhoto = (student) => {
    setPhotoError(false);
    setSelectedStudent(student);
  };

  const closePhoto = () => {
    setSelectedStudent(null);
    setPhotoError(false);
  };

  // ====================================================
  // DOWNLOAD PHOTO
  // ====================================================
  const downloadPhoto = async () => {
    if (!selectedStudent) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/photo/${selectedStudent.id}`
      );

      if (!response.ok) {
        throw new Error("Photo download failed");
      }

      const blob = await response.blob();

      saveBlob(
        blob,
        selectedStudent.photoname || `student_${selectedStudent.id}.jpg`
      );
    } catch (error) {
      console.error("Download photo error:", error);
      alert("Photo download failed.");
    }
  };

  // ====================================================
  // SEARCH FILTER
  // ====================================================
  const searchText = search.trim().toLowerCase();

  const filteredStudents = students.filter((student) => {
    if (searchText === "") {
      return true;
    }

    return [
      student.id,
      student.name,
      student.address,
      student.photoname,
    ].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(searchText)
    );
  });

  // ====================================================
  // PAGINATION CALCULATION
  // ====================================================
  const totalPages = Math.ceil(filteredStudents.length / studentsPerPage);

  // Never allow the page to go outside the valid range
  const safePage = Math.min(currentPage, Math.max(totalPages, 1));

  const startIndex = (safePage - 1) * studentsPerPage;
  const endIndex = startIndex + studentsPerPage;

  const currentStudents = filteredStudents.slice(startIndex, endIndex);

  // Show only 5 page numbers at a time
  const windowSize = 5;
  let windowStart = Math.max(1, safePage - Math.floor(windowSize / 2));
  let windowEnd = Math.min(totalPages, windowStart + windowSize - 1);
  windowStart = Math.max(1, windowEnd - windowSize + 1);

  const pageNumbers = [];
  for (let page = windowStart; page <= windowEnd; page++) {
    pageNumbers.push(page);
  }

  // ====================================================
  // HANDLERS
  // ====================================================
  const handleSearch = (event) => {
    setSearch(event.target.value);
    setCurrentPage(1);
  };

  const clearSearch = () => {
    setSearch("");
    setCurrentPage(1);
  };

  const handleStudentsPerPage = (event) => {
    setStudentsPerPage(Number(event.target.value));
    setCurrentPage(1);
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // ====================================================
  // CSV DOWNLOADS
  // ====================================================
  const downloadCurrentPage = () => {
    if (currentStudents.length === 0) {
      alert("There are no students on the current page.");
      return;
    }

    downloadCSV(buildCSV(currentStudents), `students_page_${safePage}.csv`);
  };

  const downloadAllStudents = () => {
    if (filteredStudents.length === 0) {
      alert("There are no students to download.");
      return;
    }

    downloadCSV(buildCSV(filteredStudents), "all_students.csv");
  };

  // ====================================================
  // JSX
  // ====================================================
  return (
    <div style={{ padding: "25px", fontFamily: "Arial, sans-serif" }}>
      {/* ================= REGISTRATION ================= */}
      <h1>Student Registration</h1>

      <form onSubmit={handleSubmit} style={{ width: "400px", maxWidth: "100%" }}>
        {/* NAME */}
        <label>Student Name</label>
        <br />
        <input
          type="text"
          value={name}
          placeholder="Enter student name"
          onChange={(event) => setName(event.target.value)}
          required
          style={{
            width: "100%",
            padding: "10px",
            marginTop: "5px",
            boxSizing: "border-box",
          }}
        />

        <br />
        <br />

        {/* ADDRESS */}
        <label>Student Address</label>
        <br />
        <input
          type="text"
          value={address}
          placeholder="Enter student address"
          onChange={(event) => setAddress(event.target.value)}
          required
          style={{
            width: "100%",
            padding: "10px",
            marginTop: "5px",
            boxSizing: "border-box",
          }}
        />

        <br />
        <br />

        {/* ================= PHOTO SECTION ================= */}
        <label>Student Photo</label>

        {/* MODE TOGGLE */}
        <div style={{ display: "flex", gap: "8px", margin: "8px 0 12px 0" }}>
          <button
            type="button"
            onClick={() => changePhotoMode("upload")}
            style={{
              padding: "8px 14px",
              cursor: "pointer",
              fontWeight: photoMode === "upload" ? "bold" : "normal",
              border:
                photoMode === "upload" ? "2px solid #333" : "1px solid #999",
              backgroundColor: photoMode === "upload" ? "#eee" : "white",
              borderRadius: "5px",
            }}
          >
            Upload Photo
          </button>

          <button
            type="button"
            onClick={() => changePhotoMode("camera")}
            style={{
              padding: "8px 14px",
              cursor: "pointer",
              fontWeight: photoMode === "camera" ? "bold" : "normal",
              border:
                photoMode === "camera" ? "2px solid #333" : "1px solid #999",
              backgroundColor: photoMode === "camera" ? "#eee" : "white",
              borderRadius: "5px",
            }}
          >
            Use Camera
          </button>
        </div>

        {/* UPLOAD MODE */}
        {photoMode === "upload" && (
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={(event) => {
              if (event.target.files && event.target.files.length > 0) {
                setPhoto(event.target.files[0]);
              } else {
                setPhoto(null);
              }
            }}
            required
          />
        )}

        {/* CAMERA MODE */}
        {photoMode === "camera" && (
          <div>
            {/* Camera not started and nothing captured */}
            {!cameraOn && !photo && (
              <button
                type="button"
                onClick={() => startCamera()}
                style={{ padding: "10px 20px", cursor: "pointer" }}
              >
                Start Camera
              </button>
            )}

            {/* Live video */}
            {cameraOn && (
              <div>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: "100%",
                    borderRadius: "8px",
                    backgroundColor: "#000",
                    display: "block",
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginTop: "10px",
                  }}
                >
                  <button
                    type="button"
                    onClick={capturePhoto}
                    style={{ padding: "10px 20px", cursor: "pointer" }}
                  >
                    Capture Photo
                  </button>

                  <button
                    type="button"
                    onClick={switchCamera}
                    style={{ padding: "10px 20px", cursor: "pointer" }}
                  >
                    Switch Camera
                  </button>

                  <button
                    type="button"
                    onClick={stopCamera}
                    style={{ padding: "10px 20px", cursor: "pointer" }}
                  >
                    Stop Camera
                  </button>
                </div>
              </div>
            )}

            {/* Captured photo preview */}
            {!cameraOn && photo && photoPreview && (
              <div>
                <img
                  src={photoPreview}
                  alt="Captured"
                  style={{
                    width: "100%",
                    borderRadius: "8px",
                    display: "block",
                  }}
                />

                <button
                  type="button"
                  onClick={retakePhoto}
                  style={{
                    padding: "10px 20px",
                    cursor: "pointer",
                    marginTop: "10px",
                  }}
                >
                  Retake Photo
                </button>
              </div>
            )}

            {/* Camera error */}
            {cameraError && (
              <p style={{ color: "red", marginBottom: 0 }}>{cameraError}</p>
            )}
          </div>
        )}

        {/* Preview of an uploaded file */}
        {photoMode === "upload" && photo && photoPreview && (
          <img
            src={photoPreview}
            alt="Selected"
            style={{
              width: "150px",
              maxWidth: "100%",
              borderRadius: "8px",
              display: "block",
              marginTop: "10px",
            }}
          />
        )}

        <br />

        {/* REGISTER BUTTON */}
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 20px",
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Registering..." : "Register Student"}
        </button>
      </form>

      <hr style={{ margin: "30px 0" }} />

      {/* ================= ALL STUDENTS ================= */}
      <h1>All Students</h1>

      {/* SEARCH + CONTROLS */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "15px",
        }}
      >
        <input
          type="text"
          value={search}
          placeholder="Search by ID, name, address or photo name"
          onChange={handleSearch}
          style={{
            width: "350px",
            maxWidth: "100%",
            padding: "10px",
            border: "1px solid #999",
            borderRadius: "5px",
          }}
        />

        {search !== "" && (
          <button type="button" onClick={clearSearch}>
            Clear
          </button>
        )}

        <select
          value={studentsPerPage}
          onChange={handleStudentsPerPage}
          style={{ padding: "10px" }}
        >
          <option value="5">5 Students</option>
          <option value="10">10 Students</option>
          <option value="20">20 Students</option>
          <option value="50">50 Students</option>
        </select>

        <button type="button" onClick={downloadCurrentPage}>
          Download Current Page
        </button>

        <button type="button" onClick={downloadAllStudents}>
          Download All
        </button>
      </div>

      {/* STUDENT COUNT */}
      <p>
        {loading ? (
          "Loading students..."
        ) : filteredStudents.length === 0 ? (
          "No students found."
        ) : (
          <>
            Showing <b>{startIndex + 1}</b> -{" "}
            <b>{Math.min(endIndex, filteredStudents.length)}</b> of{" "}
            <b>{filteredStudents.length}</b> students
          </>
        )}
      </p>

      {/* TABLE */}
      <div style={{ overflowX: "auto" }}>
        <table
          border="1"
          cellPadding="10"
          style={{ width: "100%", borderCollapse: "collapse" }}
        >
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Address</th>
              <th>Photo Name</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {currentStudents.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  style={{ textAlign: "center", padding: "20px" }}
                >
                  {loading ? "Loading..." : "No students found."}
                </td>
              </tr>
            ) : (
              currentStudents.map((student) => (
                <tr key={student.id}>
                  <td>{student.id}</td>
                  <td>{student.name}</td>
                  <td>{student.address}</td>
                  <td>{student.photoname || "N/A"}</td>
                  <td>
                    <button type="button" onClick={() => viewPhoto(student)}>
                      View Photo
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      {totalPages > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "5px",
            marginTop: "20px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            disabled={safePage === 1}
            onClick={() => goToPage(1)}
          >
            First
          </button>

          <button
            type="button"
            disabled={safePage === 1}
            onClick={() => goToPage(safePage - 1)}
          >
            Previous
          </button>

          {pageNumbers.map((page) => (
            <button
              type="button"
              key={page}
              onClick={() => goToPage(page)}
              style={{
                padding: "7px 12px",
                fontWeight: safePage === page ? "bold" : "normal",
                cursor: "pointer",
              }}
            >
              {page}
            </button>
          ))}

          <button
            type="button"
            disabled={safePage === totalPages}
            onClick={() => goToPage(safePage + 1)}
          >
            Next
          </button>

          <button
            type="button"
            disabled={safePage === totalPages}
            onClick={() => goToPage(totalPages)}
          >
            Last
          </button>
        </div>
      )}

      {/* PAGE INFORMATION */}
      {totalPages > 0 && (
        <p style={{ textAlign: "center" }}>
          Page <b>{safePage}</b> of <b>{totalPages}</b>
        </p>
      )}

      {/* ================= PHOTO POPUP ================= */}
      {selectedStudent && (
        <div
          onClick={closePhoto}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              backgroundColor: "white",
              padding: "20px",
              borderRadius: "10px",
              textAlign: "center",
              maxWidth: "90%",
              maxHeight: "90%",
              overflow: "auto",
            }}
          >
            <h2>{selectedStudent.name}'s Photo</h2>

            {photoError ? (
              <p style={{ color: "red" }}>Unable to load photo.</p>
            ) : (
              <img
                src={`${API_BASE_URL}/photo/${selectedStudent.id}`}
                alt={selectedStudent.name}
                onError={() => setPhotoError(true)}
                style={{
                  width: "300px",
                  maxWidth: "100%",
                  maxHeight: "400px",
                  objectFit: "contain",
                  display: "block",
                  margin: "0 auto 20px auto",
                }}
              />
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={downloadPhoto}
                disabled={photoError}
              >
                Download Photo
              </button>

              <button type="button" onClick={closePhoto}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================
// EXPORT
// ======================================================
export default App;
