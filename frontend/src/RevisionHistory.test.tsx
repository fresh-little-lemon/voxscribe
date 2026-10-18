// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import RevisionHistory from './RevisionHistory';
import {createHistory,appendRevision} from './revision-history';
afterEach(cleanup);
const initial={segments:[],importVersions:[],language:'English',method:'aligned'};
function fixture(){const history=appendRevision(createHistory('doc',initial,'media'),{...initial,language:'Chinese'},'media','切换语言');const onDelete=vi.fn(),onRestore=vi.fn(),onClose=vi.fn();render(<RevisionHistory history={history} onDelete={onDelete} onRestore={onRestore} onClose={onClose}/>);return {history,onDelete,onRestore,onClose}}
test('clear history shows irreversible warning and cancellation never invokes deletion',()=>{const {onDelete}=fixture();fireEvent.click(screen.getByText('清空以前的历史'));expect(screen.getByRole('alertdialog').textContent).toContain('无法撤销');fireEvent.click(screen.getByText('取消'));expect(onDelete).not.toHaveBeenCalled();expect(screen.queryByRole('alertdialog')).toBeNull()});
test('explicit clear confirmation passes only old revision IDs',()=>{const {history,onDelete}=fixture();fireEvent.click(screen.getByText('清空以前的历史'));fireEvent.click(screen.getByText('确认永久删除历史'));expect(onDelete).toHaveBeenCalledWith([history.revisions[0].id]);expect(screen.queryByRole('alertdialog')).toBeNull()});
test('preview is non-mutating and rollback is a separate deliberate action',()=>{const {history,onRestore}=fixture();fireEvent.click(screen.getByText('初始版本'));expect(screen.getByText('对齐语言：Chinese → English')).toBeTruthy();expect(onRestore).not.toHaveBeenCalled();fireEvent.click(screen.getByText('回滚到此版本'));expect(onRestore).toHaveBeenCalledWith(history.revisions[0].id)});
