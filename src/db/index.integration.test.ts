import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import { EventDB, newStateRecord, newInboundRecord, newOutboundRecord, BaseRecord } from ".";
import { TestCreateLocalTable } from "../integration-test-helpers";

describe("EventDB", () => {
  describe("getState", () => {
    it("can get the state record if it exists", async () => {
      const testDB = await TestCreateLocalTable();
      try {
        const db = new EventDB(testDB.client, testDB.name, "facetName");
        const state = { key: "value" };
        const stateRecord = newStateRecord<any>("facetName", "idValue", 1, state, new Date());
        await db.putState(stateRecord, 0);

        const actual = await db.getState("idValue");
        expect(actual).toEqual(stateRecord);
      } finally {
        await testDB.delete();
      }
    });
  });
  describe("putState", () => {
    it("can put a new state record", async () => {
      const testDB = await TestCreateLocalTable();
      try {
        const db = new EventDB(testDB.client, testDB.name, "facetName");
        const state1 = { key: "value1" };
        const stateRecord1 = newStateRecord<any>("facetName", "idValue", 1, state1, new Date());
        await db.putState(stateRecord1, 0);
        const state2 = { key: "value2" };
        const stateRecord2 = newStateRecord<any>("facetName", "idValue", 2, state2, new Date());
        await db.putState(stateRecord2, 1);

        const actual = await db.getState("idValue");
        expect(actual).toEqual(stateRecord2);
      } finally {
        await testDB.delete();
      }
    });
    it("can put a new state record with a secondary index record", async () => {
      const testDB = await TestCreateLocalTable();
      try {
        const secondaryIndexForRecordFunc = (r: BaseRecord, idValue: string): BaseRecord => ({
          ...r,
          _id: `facetName/secondaryIndex/${idValue}`,
        });

        const db = new EventDB(testDB.client, testDB.name, "facetName");

        // State 1
        const state1 = { key: "value1" };
        const stateRecord1 = newStateRecord<any>("facetName", "idValue", 1, state1, new Date());
        await db.putState(
          stateRecord1,
          0,
          [],
          [],
          [secondaryIndexForRecordFunc(stateRecord1, "idValue")],
        );

        // State 2
        const state2 = { key: "value2" };
        const stateRecord2 = newStateRecord<any>("facetName", "idValue", 2, state2, new Date());
        await db.putState(
          stateRecord2,
          1,
          [],
          [],
          [secondaryIndexForRecordFunc(stateRecord2, "idValue")],
        );

        const actual = await db.getState("idValue");
        expect(actual).toEqual(stateRecord2);

        const actualSecondary = (await db.queryRecordsBySecondaryIndex(
          "secondaryIndex",
          "idValue",
        )) as Array<BaseRecord & { key: string }>;
        expect(actualSecondary).toHaveLength(1);
        expect(actualSecondary[0]).toEqual({
          ...stateRecord2,
          _id: "facetName/secondaryIndex/idValue",
        });
      } finally {
        await testDB.delete();
      }
    });
    it("can put inbound records alongside a new state record", async () => {
      const testDB = await TestCreateLocalTable();
      try {
        const db = new EventDB(testDB.client, testDB.name, "facetName");
        const state = { key: "value1" };
        const stateRecord = newStateRecord<any>("facetName", "idValue", 3, state, new Date());
        const inboundRecords = [
          newInboundRecord(
            "facetName",
            "idValue",
            1,
            "inbound",
            { record: "inbound1" },
            new Date(),
          ),
          newInboundRecord(
            "facetName",
            "idValue",
            2,
            "inbound",
            { record: "inbound2" },
            new Date(),
          ),
        ];
        await db.putState(stateRecord, 0, inboundRecords);

        const actual = await db.queryRecords("idValue");
        expect(actual).toEqual([...inboundRecords, stateRecord]);
      } finally {
        await testDB.delete();
      }
    });
    it("can put outbound records alongside a new state record", async () => {
      const testDB = await TestCreateLocalTable();
      try {
        const db = new EventDB(testDB.client, testDB.name, "facetName");
        const state = { key: "value1" };
        const stateRecord = newStateRecord<any>("facetName", "idValue", 5, state, new Date());
        const inboundRecords = [
          newInboundRecord(
            "facetName",
            "idValue",
            1,
            "inbound",
            { record: "inbound1" },
            new Date(),
          ),
          newInboundRecord(
            "facetName",
            "idValue",
            2,
            "inbound",
            { record: "inbound2" },
            new Date(),
          ),
        ];
        const outboundRecords = [
          newOutboundRecord(
            "facetName",
            "idValue",
            3,
            0,
            "inbound",
            { record: "inbound1" },
            new Date(),
          ),
          newOutboundRecord(
            "facetName",
            "idValue",
            3,
            1,
            "outbound",
            { outbound: "test1" },
            new Date(),
          ),
        ];
        await db.putState(stateRecord, 0, inboundRecords, outboundRecords);

        const actual = await db.queryRecords("idValue");
        expect(actual).toEqual([...inboundRecords, ...outboundRecords, stateRecord]);
      } finally {
        await testDB.delete();
      }
    });
    it("validates state records are the right type", async () => {
      const db = new EventDB({} as DynamoDBDocumentClient, "fakeName", "facetName");
      try {
        await db.putState(newOutboundRecord("not_important", "", 0, 0, "test", {}, new Date()), 0);
      } catch (e: any) {
        expect(e.message).toBe("putState: invalid state record");
      }
    });
    it("validates state records are the right facet", async () => {
      const db = new EventDB({} as DynamoDBDocumentClient, "fakeName", "facetName");
      try {
        await db.putState(newStateRecord("incorrect_facet", "", 0, {}, new Date()), 0);
      } catch (e: any) {
        expect(e.message).toBe(
          'putState: state record has mismatched facet. Expected: "facetName", got: "incorrect_facet"',
        );
      }
    });
    it("validates inbound records are the right type", async () => {
      const db = new EventDB({} as DynamoDBDocumentClient, "fakeName", "facetName");
      try {
        await db.putState(newStateRecord("facetName", "", 0, {}, new Date()), 0, [
          newOutboundRecord("facetName", "id", 0, 1, "facetEvent", {}, new Date()),
        ]);
      } catch (e: any) {
        expect(e.message).toBe("putState: invalid inbound record");
      }
    });
    it("validates inbound records are the right facet", async () => {
      const db = new EventDB({} as DynamoDBDocumentClient, "fakeName", "facetName");
      try {
        await db.putState(newStateRecord("facetName", "", 0, {}, new Date()), 0, [
          newInboundRecord("incorrect_facet", "id", 0, "facetEvent", {}, new Date()),
        ]);
      } catch (e: any) {
        expect(e.message).toBe("putState: invalid facet for inbound record");
      }
    });
    it("validates outbound records are the right type", async () => {
      const db = new EventDB({} as DynamoDBDocumentClient, "fakeName", "facetName");
      try {
        await db.putState(
          newStateRecord("facetName", "", 0, {}, new Date()),
          0,
          [newInboundRecord("facetName", "id", 0, "facetEvent", {}, new Date())],
          [newInboundRecord("facetName", "id", 0, "facetEvent", {}, new Date())],
        );
      } catch (e: any) {
        expect(e.message).toBe("putState: invalid outbound record");
      }
    });
    it("validates outbound records are the right facet", async () => {
      const db = new EventDB({} as DynamoDBDocumentClient, "fakeName", "facetName");
      try {
        await db.putState(
          newStateRecord("facetName", "", 0, {}, new Date()),
          0,
          [newInboundRecord("facetName", "id", 0, "facetEvent", {}, new Date())],
          [newOutboundRecord("incorrect_facet", "id", 0, 1, "outboundType", {}, new Date())],
        );
      } catch (e: any) {
        expect(e.message).toBe("putState: invalid facet for outbound record");
      }
    });
    it("validates that only 25 records can be posted at once", async () => {
      const db = new EventDB({} as DynamoDBDocumentClient, "fakeName", "facetName");
      const inboundRecords = Array.from(new Array(26), (i) =>
        newInboundRecord("facetName", "id", i, "anyTypeName", {}, new Date()),
      );
      try {
        await db.putState(newStateRecord("facetName", "", 0, {}, new Date()), 0, inboundRecords);
      } catch (e: any) {
        expect(e.message).toBe(
          "putState: cannot exceed maximum DynamoDB transaction count of 25. The transaction attempted to write 27.",
        );
      }
    });
  });
});
