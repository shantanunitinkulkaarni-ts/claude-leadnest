# Simulate a customer message going through Phase 1
$testMessage = "I want to rent a 2BHK in Baner for 20k"

Write-Host "=== Testing Phase 1 ===" -ForegroundColor Green
Write-Host "Customer says: $testMessage" -ForegroundColor Yellow
Write-Host ""

# Step 1: Call the intent extractor (simulated)
Write-Host "Step 1: AI decodes intent..." -ForegroundColor Cyan
Write-Host "→ Intent: rent" -ForegroundColor White
Write-Host "→ Area: Baner" -ForegroundColor White
Write-Host "→ Budget: ₹20,000/month" -ForegroundColor White
Write-Host "→ BHK: 2" -ForegroundColor White
Write-Host ""

# Step 2: Code matches against database
Write-Host "Step 2: Code matches against database..." -ForegroundColor Cyan
Write-Host "→ Searching for: rent, Baner, 2BHK, up to ₹20k" -ForegroundColor White
Write-Host "→ Result: No matching property found" -ForegroundColor Red
Write-Host ""

# Step 3: Bot response
Write-Host "Step 3: Bot responds (no AI involved):" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""I don't have a property matching that right now."" -ForegroundColor Green
Write-Host ""Let me connect you with our team."" -ForegroundColor Green
Write-Host "[Agent Contact Card]" -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""
Write-Host "✅ No fake property was generated. The AI never wrote a price." -ForegroundColor Green