// ─── ids-examples.ts ──────────────────────────────────────────────────────────
// Bundled, ready-to-run sample .ids documents so users without their own IDS can
// try the checker (parallel to the demo-models gallery for IFC). Each is valid
// buildingSMART IDS 1.0 XML (downloadable + usable elsewhere), targets common
// psets/attributes so it produces meaningful pass/fail on typical IFC, and
// declares both IFC2X3 + IFC4 so it applies to every demo model. The XML lives
// here (the file content); the name/description are localized via the `ids`
// namespace (`ids:examples.<id>.name|desc`).

export interface IdsExample {
  id: string
  /** Synthetic file name used for display + stale detection. */
  fileName: string
  /** i18n key stem under `ids:examples.` — `${labelKey}Name` / `${labelKey}Desc`. */
  labelKey: string
  xml: string
}

const HEAD =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<ids xmlns="http://standards.buildingsmart.org/IDS" ' +
  'xmlns:xs="http://www.w3.org/2001/XMLSchema" ' +
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
  'xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">'

export const IDS_EXAMPLES: IdsExample[] = [
  {
    id: 'has-walls',
    fileName: 'sample-model-has-walls.ids',
    labelKey: 'hasWalls',
    xml: `${HEAD}
  <info><title>Deliverable must contain walls</title></info>
  <specifications>
    <specification name="The model contains at least one wall" ifcVersion="IFC2X3 IFC4" minOccurs="1" maxOccurs="unbounded">
      <applicability>
        <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
      </applicability>
      <requirements>
        <attribute cardinality="required"><name><simpleValue>Name</simpleValue></name></attribute>
      </requirements>
    </specification>
  </specifications>
</ids>`,
  },
  {
    id: 'named-elements',
    fileName: 'sample-elements-are-named.ids',
    labelKey: 'namedElements',
    xml: `${HEAD}
  <info><title>Building elements are named</title></info>
  <specifications>
    <specification name="Common building elements must have a Name" ifcVersion="IFC2X3 IFC4">
      <applicability maxOccurs="unbounded">
        <entity>
          <name>
            <xs:restriction base="xs:string">
              <xs:enumeration value="IFCWALL"/>
              <xs:enumeration value="IFCSLAB"/>
              <xs:enumeration value="IFCDOOR"/>
              <xs:enumeration value="IFCWINDOW"/>
              <xs:enumeration value="IFCCOLUMN"/>
              <xs:enumeration value="IFCBEAM"/>
            </xs:restriction>
          </name>
        </entity>
      </applicability>
      <requirements>
        <attribute cardinality="required"><name><simpleValue>Name</simpleValue></name></attribute>
      </requirements>
    </specification>
  </specifications>
</ids>`,
  },
  {
    id: 'wall-fire-rating',
    fileName: 'sample-walls-fire-rating.ids',
    labelKey: 'wallFireRating',
    xml: `${HEAD}
  <info><title>Walls have a fire rating</title></info>
  <specifications>
    <specification name="Walls declare a FireRating in Pset_WallCommon" ifcVersion="IFC2X3 IFC4">
      <applicability maxOccurs="unbounded">
        <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
      </applicability>
      <requirements>
        <property dataType="IFCLABEL" cardinality="required">
          <propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet>
          <baseName><simpleValue>FireRating</simpleValue></baseName>
        </property>
      </requirements>
    </specification>
  </specifications>
</ids>`,
  },
  {
    id: 'doors-named-rated',
    fileName: 'sample-doors-named-and-rated.ids',
    labelKey: 'doorsNamedRated',
    xml: `${HEAD}
  <info><title>Doors are named and fire-rated</title></info>
  <specifications>
    <specification name="Doors have a Name and a FireRating" ifcVersion="IFC2X3 IFC4">
      <applicability maxOccurs="unbounded">
        <entity><name><simpleValue>IFCDOOR</simpleValue></name></entity>
      </applicability>
      <requirements>
        <attribute cardinality="required"><name><simpleValue>Name</simpleValue></name></attribute>
        <property dataType="IFCLABEL" cardinality="required">
          <propertySet><simpleValue>Pset_DoorCommon</simpleValue></propertySet>
          <baseName><simpleValue>FireRating</simpleValue></baseName>
        </property>
      </requirements>
    </specification>
  </specifications>
</ids>`,
  },
]
