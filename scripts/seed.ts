import {getDatabase,readReports} from '../src/lib/db';
const db=getDatabase();console.log(`${readReports(db).length} reports stored`);db.close();
