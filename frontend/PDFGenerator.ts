import { jsPDF } from "jspdf";
import { JobReceipt } from "../types";

export function generateReceiptPDF(receipt: JobReceipt): string {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  // --- Theme Colors ---
  const PRIMARY = [15, 23, 42]; // Slate 900
  const SECONDARY = [59, 130, 246]; // Blue 500
  const TEXT_DARK = [51, 65, 85]; // Slate 700
  const ACCENT = [22, 163, 74]; // Green 600

  // Draw Header Border Line
  doc.setFillColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.rect(0, 0, 210, 15, "F");

  // Secondary highlights
  doc.setFillColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
  doc.rect(0, 15, 210, 2, "F");

  // Logo / Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text("OTTOMECH", 20, 35);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
  doc.text("ROAD ASSIST • LUCKNOW REGION", 20, 40);

  // Invoice Meta (Top Right)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text("BREAKDOWN RECEIPT", 130, 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(`Invoice ID: #${receipt.invoiceId}`, 130, 35);
  doc.text(`Date: ${receipt.date}`, 130, 40);
  doc.text(`Time: ${receipt.time}`, 130, 45);

  // Divider Line
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.line(20, 52, 190, 52);

  // --- Two Column Info Panel ---
  // Column 1: Stranded Driver Details
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text("DRIVER DETAILS:", 20, 60);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(`Contact Phone: ${receipt.driverPhone}`, 20, 65);
  doc.text("Breakdown Location:", 20, 71);
  
  // Wrap location text safely
  const locLines = doc.splitTextToSize(receipt.location, 75);
  doc.text(locLines, 20, 76);
  doc.text(`GPS Link: ${receipt.gpsCoords}`, 20, 76 + (locLines.length * 4.5));

  // Column 2: Assigned Mechanic details
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text("ASSIGNED MECHANIC:", 110, 60);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(`Garage: ${receipt.garageName}`, 110, 65);
  doc.text(`Phone: ${receipt.garagePhone}`, 110, 70);
  doc.text(`Warranty Period:`, 110, 76);
  
  doc.setFont("helvetica", "bold");
  doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.text(receipt.warrantyPeriod, 110, 81);

  // Divider
  const contentYOffset = Math.max(76 + (locLines.length * 4.5) + 8, 88);
  doc.setDrawColor(226, 232, 240);
  doc.line(20, contentYOffset, 190, contentYOffset);

  // --- Breakdown Diagnosis Info ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text("BREAKDOWN SUMMARY:", 20, contentYOffset + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Issue Category: ${receipt.issueCategory}`, 20, contentYOffset + 14);
  
  doc.setFont("helvetica", "oblique");
  const descLines = doc.splitTextToSize(`\"${receipt.issueDescription}\"`, 160);
  doc.text(descLines, 20, contentYOffset + 20);

  // Table header for breakdown fees
  const tableY = contentYOffset + 22 + (descLines.length * 4.5) + 6;
  doc.setFillColor(241, 245, 249); // Slate 100
  doc.rect(20, tableY, 170, 7, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text("Description", 25, tableY + 5);
  doc.text("Amount (INR)", 150, tableY + 5);

  // Table items
  doc.setFont("helvetica", "normal");
  const items = [
    { label: "Emergency On-Site Call-out & Diagnostics Fee", amt: receipt.baseFee },
    { label: `Roadside Repair Services (${receipt.issueCategory})`, amt: receipt.serviceFee },
    { label: `Spares / Consumables Used (${receipt.partsUsed.join(", ") || "None"})`, amt: receipt.partsFee }
  ];

  let itemY = tableY + 12;
  items.forEach((item, index) => {
    doc.text(item.label, 25, itemY);
    doc.text(`INR ${item.amt.toLocaleString()}`, 150, itemY);
    
    // Bottom border for each row
    doc.setDrawColor(241, 245, 249);
    doc.line(20, itemY + 3, 190, itemY + 3);
    itemY += 8;
  });

  // Total
  doc.setFillColor(248, 250, 252);
  doc.rect(20, itemY, 170, 9, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text("TOTAL CHARGE PAID via UPI", 25, itemY + 6);
  doc.setTextColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
  doc.text(`INR ${receipt.totalFee.toLocaleString()}`, 150, itemY + 6);

  // Warranty Stamp/Box
  const warrantyBoxY = itemY + 16;
  doc.setFillColor(239, 246, 255); // Blue 50
  doc.rect(20, warrantyBoxY, 170, 16, "F");
  doc.setDrawColor(191, 219, 254); // Blue 200
  doc.rect(20, warrantyBoxY, 170, 16, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
  doc.text("OFFICIAL OTTOMECH ASSURANCE WARRANTY", 25, warrantyBoxY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(`This breakdown is covered by a verified mechanic warranty on parts/labor for ${receipt.warrantyPeriod}.`, 25, warrantyBoxY + 11);

  // Footer note
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // Slate 400
  doc.text("Because breakdowns don't wait. OttoMech works when nothing else does.", 105, 275, { align: "center" });

  // Return base64 URI or save it
  const pdfOutput = doc.output("datauristring");
  
  // Directly trigger browser download as well
  doc.save(`OttoMech_Receipt_${receipt.invoiceId}.pdf`);

  return pdfOutput;
}
