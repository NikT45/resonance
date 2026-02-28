# CinematicPDF Prototype Notes

## Frame Naming Structure
- `F01_Auth_SignIn_CreateAccount`
- `F02_Home_Library`
- `F03_Upload_PDF_Metadata`
- `F04_Upload_Progress`
- `F05_Upload_Ready_State`
- `F06_Book_Details_Settings`
- `F07_Player_NowPlaying`
- `F08_Account_Settings`
- `F09_Component_Library`

## Primary Prototype Flow
- Home -> Upload -> Progress -> Ready -> Player
- Home -> Book Details -> Player
- Player -> Share modal
- Home (avatar) -> Account Settings
- Any Book Card -> Details

## Included Reusable Components
- Book card variants (Uploaded vs Library)
- Mini-player bar
- Sliders (Emotiveness, SFX Degree, Ambient)
- Modals (Upload, Share, Confirm)
- Toast notifications (`Upload started`, `Ready to play`, `Link copied`)
- Empty state (`No books yet`)

## Mobile-Responsive Notes
Each frame includes a visible `Mobile Notes` line with behavior guidance for:
- Layout stacking
- Touch target sizing
- Control pinning/collapsing
- Navigation adjustments
