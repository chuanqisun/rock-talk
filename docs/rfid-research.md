Here’s the short version:

- **NTAG213** = an **NFC tag IC**
- **RC522 / MFRC522** = a **reader/writer chip** mainly for **ISO/IEC 14443 Type A / MIFARE / NTAG**
- **PN532** = a more capable **NFC controller** that supports **Type A**, plus **Type B**, **FeliCa**, and **peer-to-peer**
- **ISO/IEC 14443 Type A** = the **air-interface standard/protocol family** they relate to

So the relationship is:

> **NTAG213 is a tag that speaks ISO/IEC 14443 Type A (and NFC Forum Type 2 Tag).**  
> **RC522 and PN532 are reader/controller chips that can talk to such tags.**  
> **Android phones usually act as NFC readers for NTAG213 tags.**

NTAG213 is explicitly specified by NXP as compliant with **NFC Forum Type 2 Tag** and **ISO/IEC 14443 Type A**. ([nxp.com](https://www.nxp.com/products/rfid-nfc/nfc-hf/ntag-for-tags-and-labels/ntag-213-215-216-nfc-forum-type-2-tag-compliant-ic-with-144-504-888-bytes-user-memory%3ANTAG213_215_216?utm_source=openai))  
MFRC522 supports **ISO/IEC 14443 A / MIFARE and NTAG**. ([nxp.com](https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf?utm_source=openai))  
PN532 supports **ISO/IEC 14443A/MIFARE reader/writer**, **ISO/IEC 14443B reader/writer**, **FeliCa**, card emulation, and NFC peer-to-peer. ([nxp.com](https://www.nxp.com/docs/en/nxp/data-sheets/PN532_C1.pdf?utm_source=openai))  
On Android, NTAG/MIFARE Ultralight-class tags are seen as **NfcA**, and often also **MifareUltralight** if the device implements that optional tech. ([developer.android.com](https://developer.android.com/reference/android/nfc/tech/MifareUltralight?utm_source=openai))

## Compatibility matrix

| Item                | What it is               | ISO/IEC 14443 Type A |               NFC Forum Type 2 Tag | Can read/write NTAG213? | Notes                                                                                                                                                                                                                                      |
| ------------------- | ------------------------ | -------------------: | ---------------------------------: | ----------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **NTAG213**         | Tag/PICC                 |              **Yes** |                            **Yes** |                       — | The tag itself; not a reader. ([nxp.com](https://www.nxp.com/products/rfid-nfc/nfc-hf/ntag-for-tags-and-labels/ntag-213-215-216-nfc-forum-type-2-tag-compliant-ic-with-144-504-888-bytes-user-memory%3ANTAG213_215_216?utm_source=openai)) |
| **RC522 / MFRC522** | Reader IC                |              **Yes** |                     Indirectly yes |                 **Yes** | Good for NTAG213 and MIFARE/Type A tags; not a full general NFC controller like PN532. ([nxp.com](https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf?utm_source=openai))                                                                   |
| **PN532**           | NFC controller           |              **Yes** | **Yes, via Type A tag operations** |                 **Yes** | Broader support: Type A, Type B, FeliCa, P2P, card emulation. ([nxp.com](https://www.nxp.com/docs/en/nxp/data-sheets/PN532_C1.pdf?utm_source=openai))                                                                                      |
| **Android phone**   | NFC reader/writer device |      **Usually yes** |                            **Yes** |         **Usually yes** | Reads NTAG213 as **NfcA** and often **MifareUltralight**; exact tech exposure can vary by device. ([developer.android.com](https://developer.android.com/reference/android/nfc/tech/MifareUltralight?utm_source=openai))                   |

## Practical interpretation

### 1. NTAG213 ↔ RC522

- **Compatible:** Yes.
- RC522/MFRC522 can communicate with NTAG213 because both use **ISO/IEC 14443 Type A**, and NXP states MFRC522 supports **NTAG**. ([nxp.com](https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf?utm_source=openai))

### 2. NTAG213 ↔ PN532

- **Compatible:** Yes.
- PN532 supports **ISO/IEC 14443A/MIFARE reader/writer**, so it can work with NTAG213 tags. ([nxp.com](https://www.nxp.com/docs/en/nxp/data-sheets/PN532_C1.pdf?utm_source=openai))

### 3. NTAG213 ↔ Android phone

- **Compatible:** Usually yes.
- Android NFC devices commonly read/write NFC Forum tags; NTAG213 appears as **NfcA** and may also expose **MifareUltralight** APIs depending on device support. ([developer.android.com](https://developer.android.com/reference/android/nfc/tech/MifareUltralight?utm_source=openai))

### 4. RC522 ↔ Android phone

- **Not a direct peer relationship in normal use.**
- RC522 is mainly a reader IC for embedded hosts, not a phone-facing NFC peer/controller stack. A phone can read a tag; RC522 can read a tag; but **phone-to-RC522 direct NFC interoperability is not the normal target**. This is an inference from their roles. ([nxp.com](https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf?utm_source=openai))

### 5. PN532 ↔ Android phone

- **Sometimes, depending on mode/use case.**
- PN532 supports **peer-to-peer** and **card emulation**, so it is much more likely than RC522 to interact with phones beyond simple tag reading scenarios. Actual app-level compatibility depends on firmware/protocol used. ([nxp.com](https://www.nxp.com/docs/en/nxp/data-sheets/PN532_C1.pdf?utm_source=openai))

## Bottom line

If your goal is **just to use NTAG213 tags**:

- **Android phone:** good choice
- **PN532:** good choice, more flexible
- **RC522:** works for NTAG213, but is narrower in scope than PN532

If you want, I can next provide:

1. a **more detailed matrix** including **read UID / read NDEF / write NDEF / password auth**, or
2. a **system block diagram** showing how these pieces fit together.

## References

1. [NTAG 213/215/216 | NXP Semiconductors](https://www.nxp.com/products/rfid-nfc/nfc-hf/ntag-for-tags-and-labels/ntag-213-215-216-nfc-forum-type-2-tag-compliant-ic-with-144-504-888-bytes-user-memory%3ANTAG213_215_216?utm_source=openai)
2. [MFRC522I²C
   BUSStandard performance MIFARE and NTAG](https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf?utm_source=openai)
3. [PN532/C1
   Near Field Communication (NFC) controller](https://www.nxp.com/docs/en/nxp/data-sheets/PN532_C1.pdf?utm_source=openai)
4. [MifareUltralight  |  API reference  |  Android Developers](https://developer.android.com/reference/android/nfc/tech/MifareUltralight?utm_source=openai)
