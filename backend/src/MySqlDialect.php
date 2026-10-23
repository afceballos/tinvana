<?php
declare(strict_types=1);
namespace App;

/** Converts the small, explicitly supported PostgreSQL SQL subset used by this app. */
final class MySqlDialect
{
    public static function sql(string $sql): string
    {
        // PostgreSQL casts have no runtime role here: JSON is validated by the MySQL column.
        $sql=preg_replace('/\?\s*::(?:jsonb|json|date|timestamptz|timestamp\s+with\s+time\s+zone)/i','?',$sql)??$sql;
        $sql=preg_replace('/\b([a-z_][a-z0-9_.]*)\s*::\s*text\b/i','CAST($1 AS CHAR)',$sql)??$sql;
        $sql=preg_replace('/\s+~\s+/',' REGEXP ',$sql)??$sql;
        $sql=str_ireplace(' ILIKE ',' LIKE ',$sql);
        $sql=str_ireplace(' FOR SHARE',' FOR UPDATE',$sql);
        $sql=preg_replace('/\bto_char\(\s*([a-z_][a-z0-9_.]*)\s+AT TIME ZONE\s+\'UTC\'\s*,\s*\'YYYY-MM\'\s*\)/i',"DATE_FORMAT($1, '%Y-%m')",$sql)??$sql;
        $sql=preg_replace('/\bnow\(\)/i','UTC_TIMESTAMP(6)',$sql)??$sql;
        $sql=preg_replace_callback("/UTC_TIMESTAMP\\(6\\)\\s*([+-])\\s*interval\\s+'([0-9]+)\\s+(second|minute|hour|day|week|month|year)s?'/i",static function(array $m):string {
            $fn=$m[1]==='+'?'DATE_ADD':'DATE_SUB';$unit=strtoupper($m[3]);return $fn.'(UTC_TIMESTAMP(6), INTERVAL '.$m[2].' '.$unit.')';
        },$sql)??$sql;
        $sql=preg_replace("/\\(\\s*\\?\\s*\\*\\s*interval\\s+'1 second'\\s*\\)/i",'INTERVAL ? SECOND',$sql)??$sql;
        $sql=preg_replace("/\\?\\s*\\*\\s*interval\\s+'1 second'/i",'INTERVAL ? SECOND',$sql)??$sql;
        $sql=preg_replace_callback("/\\(\\s*\\?\\s*\\+\\s*interval\\s+'([0-9]+)\\s+(second|minute|hour|day|week|month|year)s?'\\s*\\)/i",static fn(array $m):string=>'DATE_ADD(?, INTERVAL '.$m[1].' '.strtoupper($m[2]).')',$sql)??$sql;
        $sql=preg_replace_callback("/\\?\\s*\\+\\s*interval\\s+'([0-9]+)\\s+(second|minute|hour|day|week|month|year)s?'/i",static fn(array $m):string=>'DATE_ADD(?, INTERVAL '.$m[1].' '.strtoupper($m[2]).')',$sql)??$sql;
        $sql=preg_replace('/\b([a-z_][a-z0-9_.]*)\s*=\s*\1\s*\|\|\s*(\?)/i','${1}=JSON_MERGE_PRESERVE(${1},${2})',$sql)??$sql;
        $sql=preg_replace('/\b([a-z_][a-z0-9_.]*)\s*=\s*([a-z_][a-z0-9_.]*\.)?settings\s*\|\|\s*excluded\.settings/i','$1=JSON_MERGE_PATCH($2settings,VALUES(settings))',$sql)??$sql;
        // MySQL places the locking clause after LIMIT, and does not accept PostgreSQL's OF alias.
        $sql=preg_replace('/ORDER BY (.*?)\s+FOR UPDATE OF [a-z_][a-z0-9_]*\s+SKIP LOCKED\s+LIMIT ([0-9]+)/is','ORDER BY $1 LIMIT $2 FOR UPDATE SKIP LOCKED',$sql)??$sql;
        $sql=preg_replace('/ORDER BY (.*?)\s+FOR UPDATE OF [a-z_][a-z0-9_]*\s+LIMIT ([0-9]+)/is','ORDER BY $1 LIMIT $2 FOR UPDATE',$sql)??$sql;
        $sql=self::upsert($sql);
        if(preg_match('/::|\bON\s+CONFLICT\b|\bRETURNING\b|\bFOR\s+UPDATE\s+OF\b|\bpg_advisory_|\bexcluded\./i',$sql))
            throw new \RuntimeException('La consulta contiene sintaxis PostgreSQL sin adaptar a MySQL.');
        return $sql;
    }

    /** @return array{sql:string,select:string,args:array,do_nothing:bool}|null */
    public static function returning(string $sql,array $args):?array
    {
        if(!preg_match('/\s+RETURNING\s+(.+)\s*$/is',$sql,$match,PREG_OFFSET_CAPTURE))return null;
        $returning=trim($match[1][0]);$position=$match[0][1];$statement=rtrim(substr($sql,0,$position));
        if(preg_match('/^UPDATE\s+([a-z_][a-z0-9_]*)\s+.*?\s+WHERE\s+(.+)$/is',$statement,$update)){
            // Positional placeholders: the WHERE clause consumes the trailing arguments, the SET clause the rest.
            $whereArgs=substr_count($update[2],'?');
            return ['sql'=>$statement,'select'=>'SELECT '.$returning.' FROM '.$update[1].' WHERE '.$update[2],'args'=>$whereArgs?array_slice(array_values($args),-$whereArgs):[],'do_nothing'=>false];
        }
        if(!preg_match('/^INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/is',$statement,$insert))return null;
        $columns=array_map(static fn(string $v):string=>trim($v),explode(',',$insert[2]));
        $values=array_map(static fn(string $v):string=>trim($v),explode(',',$insert[3]));
        if(count($columns)!==count($values))return null;
        $byColumn=[];$argIndex=0;
        foreach($columns as $index=>$column){if(str_contains($values[$index],'?'))$byColumn[$column]=$args[$argIndex++]??null;}
        $keys=[];
        if(preg_match('/ON\s+CONFLICT\s*\(([^)]+)\)/i',$statement,$conflict))$keys=array_map('trim',explode(',',$conflict[1]));
        else $keys=[$columns[0]];
        if(!$keys||array_filter($keys,static fn(string $key):bool=>!array_key_exists($key,$byColumn)))return null;
        $where=[];$selectArgs=[];foreach($keys as $key){$where[]=$key.'=?';$selectArgs[]=$byColumn[$key];}
        return ['sql'=>$statement,'select'=>'SELECT '.$returning.' FROM '.$insert[1].' WHERE '.implode(' AND ',$where),'args'=>$selectArgs,'do_nothing'=>(bool)preg_match('/ON\s+CONFLICT(?:\s*\([^)]*\))?\s+DO\s+NOTHING/i',$statement)];
    }

    private static function upsert(string $sql):string
    {
        if(!preg_match('/\bON\s+CONFLICT(?:\s*\(([^)]+)\))?\s+DO\s+(NOTHING|UPDATE\s+SET\s+.+)$/is',$sql,$match,PREG_OFFSET_CAPTURE))return $sql;
        $clause=$match[0][0];$offset=$match[0][1];$insertPrefix=rtrim(substr($sql,0,$offset));
        if(strtoupper($match[2][0])==='NOTHING'){
            if(!preg_match('/^INSERT\s+INTO\s+[a-z_][a-z0-9_]*\s*\(\s*([a-z_][a-z0-9_]*)/i',$insertPrefix,$first))return $sql;
            return $insertPrefix.' ON DUPLICATE KEY UPDATE '.$first[1].'='.$first[1];
        }
        $updates=preg_replace('/\bexcluded\.([a-z_][a-z0-9_]*)/i','VALUES($1)',$match[2][0])??$match[2][0];
        // Conditional PostgreSQL upserts must be handled in the service transaction, never discarded.
        if(preg_match('/\s+WHERE\s+/i',$updates))return $sql;
        return $insertPrefix.' ON DUPLICATE KEY UPDATE '.preg_replace('/^UPDATE\s+SET\s+/i','',$updates);
    }
}
