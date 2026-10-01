// Bo qua step khong phai loi chay nhung ngay do la loi can bao cao.
// Runner bat `StepSkipped` bat ke thuoc loai nao, nen loai moi them vao khong
// can sua o runner.
//
// code: 'skip'            -> thu nut o step sau
//       'scope-missing'   -> khong thay tin nhan ID
//       'restarted'       -> nut bi Discord thay moi luc bam

class StepSkipped extends Error {
  constructor(message, { code = 'skip', ...meta } = {}) {
    super(message);
    this.name = 'StepSkipped';
    this.code = code;
    this.skippable = true;
    Object.assign(this, meta);
  }
}

class ScopeMissing extends StepSkipped {
  constructor(messageId) {
    super(`Không tìm thấy tin nhắn ID ${messageId}`, {
      code: 'scope-missing',
      missingMessageId: messageId,
    });
    this.name = 'ScopeMissing';
  }
}

function isSkipped(err) {
  return err instanceof StepSkipped;
}

module.exports = { StepSkipped, ScopeMissing, isSkipped };