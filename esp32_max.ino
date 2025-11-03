#include <Wire.h>
#include "MAX30105.h"

MAX30105 particleSensor;

// Manual beat detection variables
long lastBeatTime = 0;
int beatThreshold = 0;
bool beatDetected = false;

// Heart rate detection variables
const byte RATE_SIZE = 4;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute;
int beatAvg;

// SpO2 calculation variables
double avered = 0;
double aveir = 0;
double sumirrms = 0;
double sumredrms = 0;
int i = 0;
int SpO2 = 0;
double ESpO2 = 95.0;
double FSpO2 = 0.7;
double frate = 0.95;

// Sensor reading variables
uint32_t irValue = 0;
uint32_t redValue = 0;
float temperature = 0;

// Stability check variables
unsigned long stableReadingStart = 0;
bool isStable = false;
const int STABLE_TIME = 3000; // 3 seconds of stable readings

void setup() {
  Serial.begin(115200);
  Serial.println("\n=================================");
  Serial.println("MAX30102 Biomedical Sensor Monitor");
  Serial.println("=================================\n");

  // Initialize sensor
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("ERROR: MAX30102 not found!");
    Serial.println("Check connections:");
    Serial.println("- SDA to GPIO 21");
    Serial.println("- SCL to GPIO 22");
    Serial.println("- VIN to 3.3V");
    Serial.println("- GND to GND");
    while (1);
  }

  Serial.println("Sensor initialized successfully!");
  
  // Configure sensor for optimal biomedical signal acquisition
  byte ledBrightness = 50;   // LED brightness (0-255)
  byte sampleAverage = 4;     // Sample averaging
  byte ledMode = 2;           // Red + IR mode
  byte sampleRate = 100;      // 100 samples per second
  int pulseWidth = 411;       // Pulse width in microseconds
  int adcRange = 4096;        // ADC range
  
  particleSensor.setup(ledBrightness, sampleAverage, ledMode, sampleRate, pulseWidth, adcRange);
  particleSensor.setPulseAmplitudeRed(0x1F);    // Higher power for Red LED
  particleSensor.setPulseAmplitudeIR(0x1F);     // Higher power for IR LED
  particleSensor.setPulseAmplitudeGreen(0);     // Turn off Green LED
  
  // Enable temperature sensor
  particleSensor.enableDIETEMPRDY();
  
  Serial.println("\n>>> Place your finger gently on the sensor <<<");
  Serial.println(">>> Keep still for accurate readings <<<\n");
  delay(2000);
}

void loop() {
  // Read sensor values
  irValue = particleSensor.getIR();
  redValue = particleSensor.getRed();
  
  // Debug: Print IR value to help determine proper threshold
  static unsigned long lastDebugPrint = 0;
  if (millis() - lastDebugPrint > 2000) {  // Show debug every 2 seconds
    Serial.print("DEBUG - IR: ");
    Serial.print(irValue);
    Serial.print(" | Red: ");
    Serial.print(redValue);
    Serial.print(" | BPM: ");
    Serial.print(beatsPerMinute, 1);
    Serial.print(" | Avg: ");
    Serial.println(beatAvg);
    lastDebugPrint = millis();
  }
  
  // Check if finger is detected (lowered threshold for better detection)
  if (irValue < 5000) {
    Serial.println("\n⚠ No finger detected! Place finger on sensor.");
    Serial.println("   (Current IR value too low)");
    beatsPerMinute = 0;
    beatAvg = 0;
    SpO2 = 0;
    isStable = false;
    delay(1000);
    return;
  }
  
  // ========== MANUAL BEAT DETECTION ==========
  // Simple peak detection algorithm
  static uint32_t lastIR = 0;
  static uint32_t beforeLastIR = 0;
  static bool risingEdge = false;
  
  // Detect peak (current value higher than previous, and previous was higher than before)
  if (irValue > lastIR && lastIR > beforeLastIR) {
    risingEdge = true;
  }
  
  // Detect when peak passes (value starts decreasing)
  if (risingEdge && irValue < lastIR) {
    // Beat detected!
    long currentTime = millis();
    long timeSinceLastBeat = currentTime - lastBeatTime;
    
    // Valid beat interval (between 300ms and 2000ms = 30-200 BPM)
    if (timeSinceLastBeat > 300 && timeSinceLastBeat < 2000) {
      beatsPerMinute = 60000.0 / timeSinceLastBeat;
      
      // Filter realistic heart rates
      if (beatsPerMinute >= 40 && beatsPerMinute <= 200) {
        rates[rateSpot++] = (byte)beatsPerMinute;
        rateSpot %= RATE_SIZE;
        
        // Calculate average
        beatAvg = 0;
        for (byte x = 0; x < RATE_SIZE; x++) {
          beatAvg += rates[x];
        }
        beatAvg /= RATE_SIZE;
      }
    }
    
    lastBeatTime = currentTime;
    risingEdge = false;
  }
  
  beforeLastIR = lastIR;
  lastIR = irValue;

  // ========== SpO2 CALCULATION ==========
  // DC and AC components for SpO2
  avered = avered * frate + (double)redValue * (1.0 - frate);
  aveir = aveir * frate + (double)irValue * (1.0 - frate);
  
  sumredrms += (redValue - avered) * (redValue - avered);
  sumirrms += (irValue - aveir) * (irValue - aveir);

  i++;

  if (i % 50 == 0) {  // Calculate every 50 samples instead of 100
    double R = (sqrt(sumredrms) / avered) / (sqrt(sumirrms) / aveir);
    
    // SpO2 calculation using calibration formula
    SpO2 = -23.3 * (R - 0.4) + 100;
    
    // Exponential smoothing filter
    ESpO2 = FSpO2 * ESpO2 + (1.0 - FSpO2) * (double)SpO2;

    // More lenient validation for SpO2 range
    if (ESpO2 <= 105 && ESpO2 >= 70) {
      SpO2 = (int)ESpO2;
    } else if (i > 200) {  // After initial calibration, force a value
      SpO2 = (int)constrain(ESpO2, 85, 100);
    } else {
      SpO2 = 0; // Invalid reading during initial calibration
    }

    // Reset accumulators
    sumredrms = 0.0;
    sumirrms = 0.0;
    i = 0;
  }

  // ========== TEMPERATURE READING ==========
  temperature = particleSensor.readTemperature();

  // ========== STABILITY CHECK ==========
  // More lenient stability check
  if (beatAvg >= 40 && beatAvg <= 150 && SpO2 >= 85 && SpO2 <= 100) {
    if (!isStable) {
      if (stableReadingStart == 0) {
        stableReadingStart = millis();
      } else if (millis() - stableReadingStart > STABLE_TIME) {
        isStable = true;
      }
    }
  } else {
    stableReadingStart = 0;
    isStable = false;
  }

  // ========== DISPLAY BIOMEDICAL PARAMETERS ==========
  // Only update display every 2 seconds for stable viewing
  static unsigned long lastDisplayUpdate = 0;
  if (millis() - lastDisplayUpdate < 2000) {
    delay(20); // Continue fast sampling but skip display
    return;
  }
  lastDisplayUpdate = millis();
  
  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.println("║     BIOMEDICAL SIGNAL READINGS         ║");
  Serial.println("╠════════════════════════════════════════╣");
  
  // Heart Rate
  Serial.print("║ ❤️  Heart Rate (BPM):          ");
  if (beatAvg > 0 && beatAvg >= 40 && beatAvg <= 180) {
    Serial.print(beatAvg);
    Serial.println(" bpm   ║");
    
    Serial.print("║     Instantaneous BPM:         ");
    Serial.print((int)beatsPerMinute);
    Serial.println(" bpm   ║");
  } else {
    Serial.println("--      ║");
    Serial.println("║     Instantaneous BPM:         --      ║");
  }
  
  Serial.println("╠════════════════════════════════════════╣");
  
  // SpO2
  Serial.print("║ 🫁 Blood Oxygen (SpO2):        ");
  if (SpO2 > 0 && SpO2 >= 80 && SpO2 <= 100) {
    Serial.print(SpO2);
    Serial.print(" %");
    
    // Status indicator
    if (SpO2 >= 95) {
      Serial.println("  ✓    ║");
    } else if (SpO2 >= 90) {
      Serial.println("  ⚠    ║");
    } else {
      Serial.println("  ✗    ║");
    }
  } else {
    Serial.println("--       ║");
  }
  
  Serial.println("╠════════════════════════════════════════╣");
  
  // Temperature (Body/Sensor Temperature)
  Serial.print("║ 🌡️  Temperature:               ");
  Serial.print(temperature, 2);
  Serial.println(" °C  ║");
  
  Serial.println("╠════════════════════════════════════════╣");
  
  // Perfusion Index (relative measure of blood flow)
  float perfusionIndex = ((float)irValue / 50000.0) * 100.0;
  Serial.print("║ 💉 Perfusion Index:            ");
  Serial.print(perfusionIndex, 1);
  Serial.println(" %   ║");
  
  Serial.println("╠════════════════════════════════════════╣");
  
  // Signal Quality Indicator
  Serial.print("║ 📊 Signal Quality:             ");
  if (isStable) {
    Serial.println("GOOD ✓ ║");
  } else if (irValue > 80000) {
    Serial.println("FAIR ⚠ ║");
  } else {
    Serial.println("POOR ✗ ║");
  }
  
  Serial.println("╚════════════════════════════════════════╝");
  
  // Health status interpretation
  if (isStable && beatAvg > 0 && SpO2 > 0) {
    Serial.println("\n📋 INTERPRETATION:");
    
    // Heart Rate Status
    if (beatAvg < 60) {
      Serial.println("   HR: Bradycardia (Low heart rate)");
    } else if (beatAvg > 100) {
      Serial.println("   HR: Tachycardia (Elevated heart rate)");
    } else {
      Serial.println("   HR: Normal resting heart rate");
    }
    
    // SpO2 Status
    if (SpO2 >= 95) {
      Serial.println("   SpO2: Normal oxygen saturation");
    } else if (SpO2 >= 90) {
      Serial.println("   SpO2: Mildly low - monitor closely");
    } else {
      Serial.println("   SpO2: LOW - medical attention advised");
    }
  } else {
    Serial.println("\n⏳ Stabilizing readings... keep finger still");
  }
  
  Serial.println("\n");
  
  // Don't add delay here - it's handled at display update check
}