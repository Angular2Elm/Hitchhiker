import { Record } from '../models/record';
import { ConnectionManager } from './connection_manager';
import { ObjectLiteral } from "typeorm/common/ObjectLiteral";
import * as _ from "lodash";
import { ResObject } from "../common/res_object";
import { Message } from "../common/message";
import { Header } from "../models/header";

export class RecordService {
    private static _sort: number = 0;

    static async getByCollectionIds(collectionIds: string[]): Promise<{ [key: string]: Record[] }> {
        const connection = await ConnectionManager.getInstance();

        const parameters: ObjectLiteral = {};
        const whereStrs = collectionIds.map((id, index) => {
            parameters[`id_${index}`] = id;
            return `collection.id=:id_${index}`;
        });
        const whereStr = whereStrs.length > 1 ? "(" + whereStrs.join(" OR ") + ")" : whereStrs[0];

        let records = await connection.getRepository(Record)
            .createQueryBuilder("record")
            .innerJoinAndSelect("record.collection", "collection")
            .leftJoinAndSelect('record.headers', 'header')
            .where(whereStr, parameters)
            .getMany();

        return _.groupBy(records, o => o.collection.id);
    }

    static async getById(id: string, includeHeaders: boolean = false): Promise<Record> {
        const connection = await ConnectionManager.getInstance();
        let rep = connection.getRepository(Record).createQueryBuilder("record");
        if (includeHeaders) {
            rep = rep.leftJoinAndSelect('record.headers', 'header');
        }
        return await rep.where('record.id=:id', { id: id }).getOne();
    }

    static async create(record: Record): Promise<ResObject> {
        record.sort = await RecordService.getMaxSort();
        return await RecordService.save(record);
    }

    static async update(record: Record): Promise<ResObject> {
        const connection = await ConnectionManager.getInstance();
        const recordInDB = await RecordService.getById(record.id);

        if (recordInDB && recordInDB.headers.length > 0) {
            await connection.getRepository(Header).remove(recordInDB.headers);
        }

        return await RecordService.save(record);
    }

    static async getMaxSort(): Promise<number> {
        const connection = await ConnectionManager.getInstance();
        const maxSortRecord = await connection.getRepository(Record)
            .createQueryBuilder('record')
            .addOrderBy('sort', 'DESC')
            .getOne();
        let maxSort = ++RecordService._sort;
        if (maxSortRecord && maxSortRecord.sort) {
            maxSort = Math.max(maxSort, maxSortRecord.sort + 1);
            RecordService._sort = maxSort;
        }
        return maxSort;
    }

    static async sort(recordId: string, collectionId: string, newSort: number): Promise<ResObject> {
        const connection = await ConnectionManager.getInstance();
        await connection.getRepository(Record).transaction(async rep => {
            await rep.query('update record r set r.sort = r.sort+1 where r.sort >= ?', [newSort]);
            await rep.createQueryBuilder('record')
                .where('record.id=:id')
                .addParameters({ 'id': recordId })
                .update(Record, { 'collectionId': collectionId, 'sort': newSort })
                .execute();
        });
        return { success: true, message: '' };
    }

    private static async save(record: Record): Promise<ResObject> {
        if (!record.name) {
            return { success: false, message: Message.recordCreateFailedOnName };
        }
        await record.save();
        return { success: true, message: '' };
    }
}