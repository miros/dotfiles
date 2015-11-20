require 'rubygems' unless defined? Gem # rubygems is only needed in 1.8

begin
  require 'irbtools'
rescue LoadError
  nil
end

begin
  require 'ap'
rescue LoadError
  nil
end

if defined?(Rails) && !Rails.env.nil? && Rails.logger
  Rails.logger = Logger.new(STDOUT)
  ActiveRecord::Base.logger = Rails.logger if defined?(ActiveRecord)
end

def no_pg_scan
  execute_sql "set enable_seqscan = off"
end

def execute_sql(str)
  ActiveRecord::Base.connection.execute(str)
end

def r!
  reload!
end

if defined?(FactoryGirl)
	def create(*args)
		FactoryGirl.create(*args)
	end
end
