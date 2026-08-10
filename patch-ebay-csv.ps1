# Patch eBay CSV export routes to add required eBay item specifics
# Run this from the root of your cardlister folder

$ErrorActionPreference = "Stop"

function Patch-File {
    param([string]$FilePath, [string]$OldText, [string]$NewText)
    
    if (-not (Test-Path $FilePath)) {
        Write-Host "ERROR: File not found: $FilePath" -ForegroundColor Red
        exit 1
    }
    
    $content = Get-Content $FilePath -Raw -Encoding UTF8
    
    if ($content -notlike "*$OldText*") {
        Write-Host "WARNING: Could not find target text in $FilePath — already patched or code has changed." -ForegroundColor Yellow
        return
    }
    
    $content = $content.Replace($OldText, $NewText)
    [System.IO.File]::WriteAllText((Resolve-Path $FilePath), $content, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Patched: $FilePath" -ForegroundColor Green
}

# ── cards.ts ─────────────────────────────────────────────────────────────────
$cardsFile = "artifacts\api-server\src\routes\cards.ts"

# Add DispatchTimeMax column + item specific columns
Patch-File $cardsFile `
    '"ShippingType",
      "ShippingService-1:Option",
      "ShippingService-1:Cost",
      "ReturnsAcceptedOption",
    ];' `
    '"DispatchTimeMax",
      "ShippingType",
      "ShippingService-1:Option",
      "ShippingService-1:Cost",
      "ReturnsAcceptedOption",
      "C:Game",
      "C:Grade",
      "C:Professional Grader",
    ];'

# Add DispatchTimeMax value + item specific values
Patch-File $cardsFile `
    '"Flat",                          // ShippingType
      "USPSFirstClass",                // ShippingService
      SHIPPING_COST.toFixed(2),        // Shipping cost to buyer
      "ReturnsNotAccepted",            // Returns
    ].map(escape).join(","));' `
    '"3",                             // DispatchTimeMax
      "Flat",                          // ShippingType
      "USPSFirstClass",                // ShippingService
      SHIPPING_COST.toFixed(2),        // Shipping cost to buyer
      "ReturnsNotAccepted",            // Returns
      "Pokémon",                       // C:Game
      "Ungraded",                      // C:Grade
      "None",                          // C:Professional Grader
    ].map(escape).join(","));'

# ── listings.ts ───────────────────────────────────────────────────────────────
$listingsFile = "artifacts\api-server\src\routes\listings.ts"

# Add DispatchTimeMax column + item specific columns
Patch-File $listingsFile `
    '"ShippingType", "ShippingService-1:Option", "ShippingService-1:Cost", "ReturnsAcceptedOption",
      "C:Game", "C:Grade", "C:Professional Grader",' `
    '"DispatchTimeMax",
      "ShippingType", "ShippingService-1:Option", "ShippingService-1:Cost", "ReturnsAcceptedOption",
      "C:Game", "C:Grade", "C:Professional Grader",'

# Add DispatchTimeMax value in listings.ts row data
Patch-File $listingsFile `
    '"Flat", "USPSFirstClass", SHIPPING_COST.toFixed(2), "ReturnsNotAccepted",
        "Pokémon", "Ungraded", "None",' `
    '"3",  // DispatchTimeMax: 3 business days handling
        "Flat", "USPSFirstClass", SHIPPING_COST.toFixed(2), "ReturnsNotAccepted",
        "Pokémon", "Ungraded", "None",'

Write-Host ""
Write-Host "Done! Now restart your local API server:" -ForegroundColor Cyan
Write-Host "  pnpm --filter @workspace/api-server run dev" -ForegroundColor White
Write-Host ""
Write-Host "Then export a fresh CSV from the app and upload it to eBay." -ForegroundColor Cyan
